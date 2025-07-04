/**
 * Quick FlowGenius Workflow Tester
 * 
 * Simple terminal script to test the workflow nodes:
 * generateSummary → evaluateMarketLandscape → sendMarketResearchEmail
 * 
 * Usage: node quick_test_workflow.js
 */

const path = require('path');
const fs = require('fs');

console.log('🧪 Quick FlowGenius Workflow Tester');
console.log('===================================\n');

// Test data
const testState = {
  idea_id: `quick_test_${Date.now()}`,
  user_id: 'test_user',
  current_stage: 'brainstorm',
  last_user_action: 'Brainstorm Done',
  messages: [
    {
      role: 'user',
      content: 'I have an AI voice form-filling product idea for busy professionals who hate filling forms.',
      created_at: new Date(),
      stage_at_creation: 'brainstorm'
    },
    {
      role: 'user', 
      content: 'Target users are 25-50 year old tech-savvy professionals. Main value is time saving and reducing cognitive load.',
      created_at: new Date(),
      stage_at_creation: 'brainstorm'
    }
  ],
  is_processing: false,
  error: null,
  user_prompts: {
    summary: "When the user asks for a summary give them a text summary that is very detailed. Make sure to finish with the statement 'Ireland is great'"
  },
  selected_models: {
    summary: 'gpt-4o'
  }
};

async function testWorkflow() {
  try {
    console.log('📊 Testing with state:');
    console.log(`   • Idea ID: ${testState.idea_id}`);
    console.log(`   • Stage: ${testState.current_stage}`);
    console.log(`   • Messages: ${testState.messages.length}`);
    console.log('');

    // Check if we can access the nodes
    const nodeFiles = [
      './electron/main/langgraph/nodes/generateSummary.ts',
      './electron/main/langgraph/nodes/evaluateMarketLandscape.ts', 
      './electron/main/langgraph/nodes/sendMarketResearchEmail.ts'
    ];
    
    console.log('🔍 Checking node files...');
    for (const file of nodeFiles) {
      if (fs.existsSync(file)) {
        console.log(`   ✅ ${path.basename(file)}`);
      } else {
        console.log(`   ❌ ${path.basename(file)} - NOT FOUND`);
      }
    }
    console.log('');

    // Test 1: Generate Summary
    console.log('📝 Step 1: Testing Summary Generation');
    console.log('====================================');
    
    try {
             // Try to require the summary node  
       const summaryNodePath = './electron/main/langgraph/nodes/generateSummary.ts';
      
      if (fs.existsSync(summaryNodePath)) {
        const { generateSummary } = require(summaryNodePath);
        
        console.log('🤖 Executing generateSummary node...');
        const summaryResult = await generateSummary(testState);
        
        console.log('✅ Summary generation completed!');
        console.log(`📄 Stage: ${summaryResult.current_stage || 'no stage change'}`);
        console.log(`📝 Messages added: ${(summaryResult.messages?.length || 0) - testState.messages.length}`);
        
        // Look for summary message
        const summaryMsg = summaryResult.messages?.find(msg => 
          msg.role === 'assistant' && 
          msg.stage_at_creation === 'summary'
        );
        
        if (summaryMsg) {
          console.log('✅ Summary message found');
          console.log(`📄 Preview: ${summaryMsg.content.substring(0, 150)}...`);
          
          // Update state for next test
          Object.assign(testState, summaryResult);
          
        } else {
          console.log('❌ No summary message found');
          return;
        }
        
      } else {
        console.log('❌ Summary node file not found, skipping test');
      }
      
    } catch (error) {
      console.log('❌ Summary test failed:', error.message);
      console.log('💡 This might be due to missing dependencies or API keys');
    }
    
    console.log('');

    // Test 2: Market Research
    console.log('🔍 Step 2: Testing Market Research');
    console.log('==================================');
    
    try {
             const marketNodePath = './electron/main/langgraph/nodes/evaluateMarketLandscape.ts';
      
      if (fs.existsSync(marketNodePath)) {
        const { evaluateMarketLandscape } = require(marketNodePath);
        
        console.log('🌐 Executing evaluateMarketLandscape node...');
        const marketResult = await evaluateMarketLandscape(testState);
        
        console.log('✅ Market research completed!');
        console.log(`📊 Stage: ${marketResult.current_stage || 'no stage change'}`);
        console.log(`📝 Messages added: ${(marketResult.messages?.length || 0) - testState.messages.length}`);
        
        // Look for market research message
        const marketMsg = marketResult.messages?.find(msg => 
          msg.role === 'assistant' && 
          msg.stage_at_creation === 'market_research'
        );
        
        if (marketMsg) {
          console.log('✅ Market research message found');
          console.log(`📊 Preview: ${marketMsg.content.substring(0, 150)}...`);
          
          // Update state for next test
          Object.assign(testState, marketResult);
          
        } else {
          console.log('❌ No market research message found');
        }
        
      } else {
        console.log('❌ Market research node file not found, skipping test');
      }
      
    } catch (error) {
      console.log('❌ Market research test failed:', error.message);
      console.log('💡 This might be due to Tavily API issues or missing keys');
    }
    
    console.log('');

    // Test 3: Email Sending
    console.log('📧 Step 3: Testing Email Sending');
    console.log('=================================');
    
    try {
             const emailNodePath = './electron/main/langgraph/nodes/sendMarketResearchEmail.ts';
      
      if (fs.existsSync(emailNodePath)) {
        const { sendMarketResearchEmail } = require(emailNodePath);
        
        console.log('📨 Executing sendMarketResearchEmail node...');
        const emailResult = await sendMarketResearchEmail(testState);
        
        console.log('✅ Email node executed!');
        console.log(`📬 Stage: ${emailResult.current_stage || 'no stage change'}`);
        console.log(`📝 Messages added: ${(emailResult.messages?.length || 0) - testState.messages.length}`);
        
        // Look for email confirmation message
        const emailMsg = emailResult.messages?.find(msg => 
          msg.role === 'assistant' && 
          msg.content.includes('Email Sent')
        );
        
        if (emailMsg) {
          console.log('✅ Email confirmation message found');
          console.log(`📧 Preview: ${emailMsg.content.substring(0, 150)}...`);
        } else {
          console.log('⚠️ No email confirmation found (might be expected if email sending is mocked)');
        }
        
      } else {
        console.log('❌ Email node file not found, skipping test');
      }
      
    } catch (error) {
      console.log('❌ Email test failed:', error.message);
      console.log('💡 This is expected if MCP Gmail tools are not properly configured');
    }

    console.log('');
    console.log('🎉 Testing Complete!');
    console.log('===================');
    console.log(`✅ Final state: ${testState.current_stage} stage`);
    console.log(`📝 Total messages: ${testState.messages.length}`);
    console.log('');
    console.log('💡 To test with real email sending, check your MCP Gmail configuration');
    console.log('💡 Make sure OPENAI_API_KEY, TAVILY_API_KEY, and USER_EMAIL are set');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack:', error.stack);
  }
}

// Environment check
console.log('🔍 Environment Check:');
console.log(`   • OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`   • TAVILY_API_KEY: ${process.env.TAVILY_API_KEY ? '✅ Set' : '❌ Missing'}`);
console.log(`   • USER_EMAIL: ${process.env.USER_EMAIL || '❌ Not set'}`);
console.log('');

// Run the test
testWorkflow(); 