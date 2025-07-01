# Styles Directory

This directory contains all CSS styles for the FlowGenius application, organized for maintainability and following OpenAI ChatGPT design principles.

## Directory Structure

### Global Styles
- `globals.css` - Global CSS styles based on OpenAI's design system
- `variables.css` - CSS custom properties (variables) for consistent theming
- `reset.css` - CSS reset/normalize for consistent browser behavior

### Component Styles
- `components.css` - Component-specific CSS styles
- Individual component modules (when needed)

## Design System

### Color Palette (OpenAI-inspired)
```css
:root {
  /* Primary Colors */
  --color-primary: #10a37f;
  --color-primary-hover: #0d9070;
  
  /* Background Colors */
  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f7f7f8;
  --color-bg-chat: #ffffff;
  
  /* Text Colors */
  --color-text-primary: #2d333a;
  --color-text-secondary: #6e7681;
  --color-text-muted: #8b949e;
  
  /* Border Colors */
  --color-border: #d0d7de;
  --color-border-muted: #e1e4e8;
  
  /* Status Colors */
  --color-success: #1a7f37;
  --color-warning: #bf8700;
  --color-error: #cf222e;
}
```

### Typography
- Primary font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto
- Font sizes follow a consistent scale
- Line heights optimized for readability

### Layout Guidelines
- Clean, minimalist design
- Consistent spacing using 8px grid system
- Responsive design for various screen sizes
- Focus on conversation experience

## Component Styling Approach

1. **CSS Modules**: Use CSS modules for component-specific styles when needed
2. **Global Styles**: Use global styles for layout and shared elements
3. **BEM Methodology**: Follow BEM naming convention for CSS classes
4. **Mobile-First**: Design mobile-first, then enhance for desktop

## File Organization

```
styles/
├── globals.css          # Global styles and layout
├── variables.css        # CSS custom properties
├── reset.css           # Browser reset/normalize
├── components.css      # Component-specific styles
└── README.md          # This documentation
```

## Style Guidelines

1. **Consistency**: Follow OpenAI ChatGPT visual patterns
2. **Accessibility**: Ensure proper contrast ratios and focus states
3. **Performance**: Minimize CSS bundle size
4. **Maintainability**: Use CSS custom properties for theming
5. **Responsive**: Design works across all device sizes 