/**
 * LangGraph Workflow Logger
 * 
 * This module provides comprehensive logging and debugging capabilities
 * for LangGraph workflow execution. It tracks node execution, state changes,
 * performance metrics, and provides detailed debugging information.
 * 
 * Key Features:
 * - Node execution tracking with timing
 * - State change logging
 * - Performance metrics collection
 * - Debug mode with verbose output
 * - Error tracking and analysis
 * - Workflow visualization helpers
 */

import { AppState } from '../../../src/types/AppState';
import { logger } from '../../../src/utils/logger';
import { stateHistory, stateMonitor } from './stateUtils';

/**
 * Workflow execution event types
 */
export enum WorkflowEventType {
  WORKFLOW_START = 'WORKFLOW_START',
  WORKFLOW_END = 'WORKFLOW_END',
  NODE_ENTER = 'NODE_ENTER',
  NODE_EXIT = 'NODE_EXIT',
  NODE_ERROR = 'NODE_ERROR',
  EDGE_TRANSITION = 'EDGE_TRANSITION',
  STATE_UPDATE = 'STATE_UPDATE',
  CONDITION_CHECK = 'CONDITION_CHECK',
  WORKFLOW_ERROR = 'WORKFLOW_ERROR'
}

/**
 * Workflow execution event
 */
export interface WorkflowEvent {
  type: WorkflowEventType;
  timestamp: Date;
  nodeName?: string;
  edgeName?: string;
  state?: Partial<AppState>;
  error?: Error;
  metadata?: Record<string, any>;
  duration?: number;
}

/**
 * Workflow execution context
 */
export interface WorkflowContext {
  workflowId: string;
  startTime: Date;
  endTime?: Date;
  events: WorkflowEvent[];
  errors: Error[];
  performance: {
    totalDuration?: number;
    nodeExecutions: Map<string, number[]>;
    stateUpdates: number;
  };
}

/**
 * Workflow logger class
 */
export class WorkflowLogger {
  private context: WorkflowContext;
  private debugMode: boolean;
  private currentNode?: string;
  private nodeStartTime?: Date;

  constructor(workflowId: string, debugMode: boolean = false) {
    this.context = {
      workflowId,
      startTime: new Date(),
      events: [],
      errors: [],
      performance: {
        nodeExecutions: new Map(),
        stateUpdates: 0
      }
    };
    this.debugMode = debugMode;
    
    logger.info('🚀 Workflow Logger: Initialized', {
      workflowId,
      debugMode,
      startTime: this.context.startTime
    });
  }

  /**
   * Log workflow start
   */
  logWorkflowStart(initialState: AppState): void {
    const event: WorkflowEvent = {
      type: WorkflowEventType.WORKFLOW_START,
      timestamp: new Date(),
      state: initialState,
      metadata: {
        idea_id: initialState.idea_id,
        stage: initialState.current_stage,
        messageCount: initialState.messages.length
      }
    };

    this.addEvent(event);
    
    if (this.debugMode) {
      logger.debug('🎬 Workflow Started', {
        workflowId: this.context.workflowId,
        initialStage: initialState.current_stage,
        lastAction: initialState.last_user_action
      });
    }
  }

  /**
   * Log workflow end
   */
  logWorkflowEnd(finalState: AppState): void {
    this.context.endTime = new Date();
    this.context.performance.totalDuration = 
      this.context.endTime.getTime() - this.context.startTime.getTime();

    const event: WorkflowEvent = {
      type: WorkflowEventType.WORKFLOW_END,
      timestamp: this.context.endTime,
      state: finalState,
      duration: this.context.performance.totalDuration,
      metadata: {
        totalEvents: this.context.events.length,
        totalErrors: this.context.errors.length,
        finalStage: finalState.current_stage
      }
    };

    this.addEvent(event);
    
    logger.info('🏁 Workflow Completed', {
      workflowId: this.context.workflowId,
      duration: this.context.performance.totalDuration,
      eventsCount: this.context.events.length,
      errorsCount: this.context.errors.length
    });

    if (this.debugMode) {
      this.printDebugSummary();
    }
  }

  /**
   * Log node entry
   */
  logNodeEnter(nodeName: string, state: AppState): void {
    this.currentNode = nodeName;
    this.nodeStartTime = new Date();

    const event: WorkflowEvent = {
      type: WorkflowEventType.NODE_ENTER,
      timestamp: this.nodeStartTime,
      nodeName,
      state,
      metadata: {
        stage: state.current_stage,
        isProcessing: state.is_processing,
        hasError: !!state.error
      }
    };

    this.addEvent(event);
    
    // Track state history
    stateHistory.addSnapshot(state, nodeName, { event: 'enter' });
    
    if (this.debugMode) {
      logger.debug(`➡️  Entering Node: ${nodeName}`, {
        stage: state.current_stage,
        lastAction: state.last_user_action,
        messageCount: state.messages.length
      });
    }
  }

  /**
   * Log node exit
   */
  logNodeExit(nodeName: string, state: AppState, updates?: Partial<AppState>): void {
    const exitTime = new Date();
    const duration = this.nodeStartTime 
      ? exitTime.getTime() - this.nodeStartTime.getTime() 
      : 0;

    const event: WorkflowEvent = {
      type: WorkflowEventType.NODE_EXIT,
      timestamp: exitTime,
      nodeName,
      state,
      duration,
      metadata: {
        updates,
        stage: state.current_stage,
        isProcessing: state.is_processing
      }
    };

    this.addEvent(event);
    
    // Track performance
    this.trackNodeExecution(nodeName, duration);
    
    // Track state history
    stateHistory.addSnapshot(state, nodeName, { event: 'exit', duration });
    
    if (this.debugMode) {
      logger.debug(`⬅️  Exiting Node: ${nodeName}`, {
        duration,
        hasUpdates: !!updates,
        updatedFields: updates ? Object.keys(updates) : []
      });
    }

    this.currentNode = undefined;
    this.nodeStartTime = undefined;
  }

  /**
   * Log node error
   */
  logNodeError(nodeName: string, error: Error, state: AppState): void {
    const event: WorkflowEvent = {
      type: WorkflowEventType.NODE_ERROR,
      timestamp: new Date(),
      nodeName,
      error,
      state,
      metadata: {
        errorMessage: error.message,
        errorStack: error.stack,
        stage: state.current_stage
      }
    };

    this.addEvent(event);
    this.context.errors.push(error);
    
    logger.error(`❌ Node Error: ${nodeName}`, {
      error: error.message,
      stack: error.stack,
      stage: state.current_stage,
      workflowId: this.context.workflowId
    });
  }

  /**
   * Log edge transition
   */
  logEdgeTransition(fromNode: string, toNode: string, condition?: string): void {
    const event: WorkflowEvent = {
      type: WorkflowEventType.EDGE_TRANSITION,
      timestamp: new Date(),
      edgeName: `${fromNode} -> ${toNode}`,
      metadata: {
        fromNode,
        toNode,
        condition
      }
    };

    this.addEvent(event);
    
    if (this.debugMode) {
      logger.debug(`🔀 Edge Transition`, {
        from: fromNode,
        to: toNode,
        condition: condition || 'direct'
      });
    }
  }

  /**
   * Log state update
   */
  logStateUpdate(updates: Partial<AppState>, source: string): void {
    this.context.performance.stateUpdates++;

    const event: WorkflowEvent = {
      type: WorkflowEventType.STATE_UPDATE,
      timestamp: new Date(),
      state: updates,
      metadata: {
        source,
        updatedFields: Object.keys(updates),
        updateCount: this.context.performance.stateUpdates
      }
    };

    this.addEvent(event);
    
    if (this.debugMode) {
      logger.debug('📝 State Update', {
        source,
        fields: Object.keys(updates),
        values: updates
      });
    }
  }

  /**
   * Log condition check
   */
  logConditionCheck(condition: string, result: boolean, metadata?: any): void {
    const event: WorkflowEvent = {
      type: WorkflowEventType.CONDITION_CHECK,
      timestamp: new Date(),
      metadata: {
        condition,
        result,
        ...metadata
      }
    };

    this.addEvent(event);
    
    if (this.debugMode) {
      logger.debug('❓ Condition Check', {
        condition,
        result,
        metadata
      });
    }
  }

  /**
   * Log workflow error
   */
  logWorkflowError(error: Error, context?: any): void {
    const event: WorkflowEvent = {
      type: WorkflowEventType.WORKFLOW_ERROR,
      timestamp: new Date(),
      error,
      metadata: {
        errorMessage: error.message,
        errorStack: error.stack,
        context
      }
    };

    this.addEvent(event);
    this.context.errors.push(error);
    
    logger.error('💥 Workflow Error', {
      error: error.message,
      stack: error.stack,
      workflowId: this.context.workflowId,
      context
    });
  }

  /**
   * Get execution summary
   */
  getExecutionSummary(): {
    workflowId: string;
    duration: number;
    eventCount: number;
    errorCount: number;
    nodeExecutions: Record<string, { count: number; avgDuration: number }>;
    stateUpdateCount: number;
  } {
    const nodeStats: Record<string, { count: number; avgDuration: number }> = {};
    
    for (const [node, durations] of this.context.performance.nodeExecutions) {
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      nodeStats[node] = {
        count: durations.length,
        avgDuration: Math.round(avg)
      };
    }

    return {
      workflowId: this.context.workflowId,
      duration: this.context.performance.totalDuration || 0,
      eventCount: this.context.events.length,
      errorCount: this.context.errors.length,
      nodeExecutions: nodeStats,
      stateUpdateCount: this.context.performance.stateUpdates
    };
  }

  /**
   * Get events by type
   */
  getEventsByType(type: WorkflowEventType): WorkflowEvent[] {
    return this.context.events.filter(event => event.type === type);
  }

  /**
   * Get node execution timeline
   */
  getNodeTimeline(): Array<{
    node: string;
    startTime: Date;
    endTime: Date;
    duration: number;
  }> {
    const timeline: Array<{
      node: string;
      startTime: Date;
      endTime: Date;
      duration: number;
    }> = [];

    let currentNodeStart: { node: string; time: Date } | null = null;

    for (const event of this.context.events) {
      if (event.type === WorkflowEventType.NODE_ENTER && event.nodeName) {
        currentNodeStart = { node: event.nodeName, time: event.timestamp };
      } else if (event.type === WorkflowEventType.NODE_EXIT && event.nodeName && currentNodeStart) {
        timeline.push({
          node: event.nodeName,
          startTime: currentNodeStart.time,
          endTime: event.timestamp,
          duration: event.duration || 0
        });
        currentNodeStart = null;
      }
    }

    return timeline;
  }

  /**
   * Export logs for analysis
   */
  exportLogs(): string {
    return JSON.stringify({
      context: this.context,
      summary: this.getExecutionSummary(),
      timeline: this.getNodeTimeline()
    }, null, 2);
  }

  /**
   * Private: Add event to log
   */
  private addEvent(event: WorkflowEvent): void {
    this.context.events.push(event);
    
    // Record metric
    stateMonitor.recordMetric('workflow_events_total', this.context.events.length);
  }

  /**
   * Private: Track node execution
   */
  private trackNodeExecution(nodeName: string, duration: number): void {
    if (!this.context.performance.nodeExecutions.has(nodeName)) {
      this.context.performance.nodeExecutions.set(nodeName, []);
    }
    
    this.context.performance.nodeExecutions.get(nodeName)!.push(duration);
    
    // Record metric
    stateMonitor.recordMetric(`node_${nodeName}_duration_ms`, duration);
  }

  /**
   * Private: Print debug summary
   */
  private printDebugSummary(): void {
    const summary = this.getExecutionSummary();
    
    console.log('\n🔍 === WORKFLOW DEBUG SUMMARY ===');
    console.log(`📋 Workflow ID: ${summary.workflowId}`);
    console.log(`⏱️  Total Duration: ${summary.duration}ms`);
    console.log(`📊 Total Events: ${summary.eventCount}`);
    console.log(`❌ Total Errors: ${summary.errorCount}`);
    console.log(`📝 State Updates: ${summary.stateUpdateCount}`);
    
    console.log('\n📈 Node Execution Stats:');
    for (const [node, stats] of Object.entries(summary.nodeExecutions)) {
      console.log(`  - ${node}: ${stats.count} executions, avg ${stats.avgDuration}ms`);
    }
    
    if (this.context.errors.length > 0) {
      console.log('\n❌ Errors:');
      this.context.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error.message}`);
      });
    }
    
    console.log('\n🔗 Node Timeline:');
    const timeline = this.getNodeTimeline();
    timeline.forEach(entry => {
      console.log(`  ${entry.node}: ${entry.duration}ms`);
    });
    
    console.log('================================\n');
  }
}

/**
 * Create a new workflow logger instance
 */
export function createWorkflowLogger(workflowId?: string, debugMode?: boolean): WorkflowLogger {
  const id = workflowId || `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  return new WorkflowLogger(id, debugMode);
} 