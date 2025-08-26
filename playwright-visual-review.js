const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

async function runVisualReview() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  const page = await context.newPage();

  const results = {
    timestamp: new Date().toISOString(),
    pages: [],
    improvements: []
  };

  console.log('🔍 Starting comprehensive visual review of retirement simulator...\n');

  try {
    // Test 1: Homepage
    console.log('📄 Testing Homepage...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    const homePageAnalysis = {
      url: '/',
      title: await page.title(),
      viewport: { width: 1280, height: 720 },
      elements: {},
      accessibility: {},
      performance: {}
    };

    // Check key elements
    const navigation = await page.locator('nav').count();
    const mainContent = await page.locator('main').count();
    const buttons = await page.locator('button').count();
    const links = await page.locator('a').count();

    homePageAnalysis.elements = {
      navigation: navigation,
      mainContent: mainContent,
      buttons: buttons,
      links: links,
      hasHeader: await page.locator('header, h1').count() > 0,
      hasFooter: await page.locator('footer').count() > 0
    };

    // Check for common UX patterns
    const hasGetStartedButton = await page.locator('text=/get started|start|begin/i').count();
    const hasNavigation = navigation > 0;
    const hasCallToAction = hasGetStartedButton > 0;

    if (!hasCallToAction) {
      results.improvements.push({
        type: 'UX',
        priority: 'high',
        page: 'Homepage',
        issue: 'Missing clear call-to-action button',
        suggestion: 'Add a prominent "Get Started" or "Begin Simulation" button'
      });
    }

    console.log(`   ✅ Elements found: nav(${navigation}), main(${mainContent}), buttons(${buttons}), links(${links})`);

    results.pages.push(homePageAnalysis);

    // Test 2: Setup Wizard
    console.log('🧙 Testing Setup Wizard...');
    const setupButton = await page.locator('text=/setup|start|begin/i').first();
    if (await setupButton.count() > 0) {
      await setupButton.click();
      await page.waitForLoadState('networkidle');
      
      const setupAnalysis = {
        url: '/setup',
        title: await page.title(),
        viewport: { width: 1280, height: 720 },
        forms: {},
        navigation: {}
      };

      const formElements = await page.locator('form').count();
      const inputElements = await page.locator('input').count();
      const selectElements = await page.locator('select').count();
      const progressIndicator = await page.locator('[role="progressbar"], .progress, .step-indicator').count();

      setupAnalysis.forms = {
        forms: formElements,
        inputs: inputElements,
        selects: selectElements,
        hasProgressIndicator: progressIndicator > 0
      };

      if (!progressIndicator) {
        results.improvements.push({
          type: 'UX',
          priority: 'medium',
          page: 'Setup Wizard',
          issue: 'Missing progress indicator',
          suggestion: 'Add progress bar or step indicator to show wizard progress'
        });
      }

      console.log(`   ✅ Form elements: forms(${formElements}), inputs(${inputElements}), selects(${selectElements})`);
      console.log(`   ✅ Progress indicator: ${progressIndicator > 0 ? 'Yes' : 'No'}`);

      results.pages.push(setupAnalysis);
    }

    // Test 3: Simulation Page
    console.log('📊 Testing Simulation Dashboard...');
    await page.goto('http://localhost:3000/simulation');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000); // Wait for charts to load

    const simulationAnalysis = {
      url: '/simulation',
      title: await page.title(),
      viewport: { width: 1280, height: 720 },
      charts: {},
      controls: {}
    };

    const canvasElements = await page.locator('canvas').count();
    const chartElements = await page.locator('.recharts-wrapper, [class*="chart"]').count();
    const controlPanels = await page.locator('[class*="control"], [class*="parameter"]').count();
    const sliders = await page.locator('input[type="range"], [role="slider"]').count();

    simulationAnalysis.charts = {
      canvasElements: canvasElements,
      chartElements: chartElements,
      hasCharts: canvasElements > 0 || chartElements > 0
    };

    simulationAnalysis.controls = {
      controlPanels: controlPanels,
      sliders: sliders,
      hasControls: controlPanels > 0 || sliders > 0
    };

    if (canvasElements === 0 && chartElements === 0) {
      results.improvements.push({
        type: 'Functionality',
        priority: 'high',
        page: 'Simulation Dashboard',
        issue: 'No charts detected',
        suggestion: 'Ensure charts are loading properly and visible to users'
      });
    }

    console.log(`   ✅ Charts: canvas(${canvasElements}), chart components(${chartElements})`);
    console.log(`   ✅ Controls: panels(${controlPanels}), sliders(${sliders})`);

    results.pages.push(simulationAnalysis);

    // Test 4: Responsive Design
    console.log('📱 Testing Responsive Design...');
    
    const viewports = [
      { name: 'Mobile', width: 375, height: 667 },
      { name: 'Tablet', width: 768, height: 1024 },
      { name: 'Desktop', width: 1920, height: 1080 }
    ];

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('http://localhost:3000');
      await page.waitForLoadState('networkidle');

      // Check for responsive elements
      const horizontalScroll = await page.evaluate(() => {
        return document.body.scrollWidth > window.innerWidth;
      });

      const mobileMenu = await page.locator('[aria-label*="menu"], .mobile-menu, [class*="mobile"]').count();

      if (horizontalScroll) {
        results.improvements.push({
          type: 'Responsive',
          priority: 'high',
          page: 'Homepage',
          viewport: viewport.name,
          issue: 'Horizontal scroll detected',
          suggestion: `Fix horizontal overflow on ${viewport.name} viewport (${viewport.width}x${viewport.height})`
        });
      }

      console.log(`   ✅ ${viewport.name} (${viewport.width}x${viewport.height}): horizontal scroll(${horizontalScroll ? 'Yes' : 'No'}), mobile menu(${mobileMenu})`);
    }

    // Reset to desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });

    // Test 5: Accessibility Check
    console.log('♿ Testing Basic Accessibility...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    const headingStructure = await page.locator('h1, h2, h3, h4, h5, h6').count();
    const altTexts = await page.locator('img[alt]').count();
    const allImages = await page.locator('img').count();
    const skipLinks = await page.locator('a[href="#main"], a[href="#content"]').count();
    const focusableElements = await page.locator('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])').count();

    const accessibilityIssues = [];
    
    if (headingStructure === 0) {
      accessibilityIssues.push('No heading structure found');
    }
    
    if (allImages > 0 && altTexts === 0) {
      accessibilityIssues.push('Images without alt text detected');
    }
    
    if (skipLinks === 0) {
      accessibilityIssues.push('No skip navigation links found');
    }

    accessibilityIssues.forEach(issue => {
      results.improvements.push({
        type: 'Accessibility',
        priority: 'medium',
        page: 'General',
        issue: issue,
        suggestion: getAccessibilitySuggestion(issue)
      });
    });

    console.log(`   ✅ Headings: ${headingStructure}, Images with alt: ${altTexts}/${allImages}, Focusable elements: ${focusableElements}`);

    // Test 6: Performance Check
    console.log('⚡ Testing Performance...');
    
    const performanceEntries = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        resourceCount: resources.length,
        largeResources: resources.filter(r => r.transferSize > 100000).length
      };
    });

    if (performanceEntries.domContentLoaded > 3000) {
      results.improvements.push({
        type: 'Performance',
        priority: 'medium',
        page: 'General',
        issue: 'Slow DOM content loading',
        suggestion: `DOM content loaded in ${performanceEntries.domContentLoaded}ms. Consider optimizing critical rendering path.`
      });
    }

    console.log(`   ✅ DOM loaded: ${performanceEntries.domContentLoaded}ms, Resources: ${performanceEntries.resourceCount}, Large resources: ${performanceEntries.largeResources}`);

  } catch (error) {
    console.error('❌ Error during testing:', error.message);
    results.error = error.message;
  }

  await browser.close();

  // Generate comprehensive report
  console.log('\n📋 VISUAL REVIEW SUMMARY');
  console.log('========================');
  console.log(`Pages tested: ${results.pages.length}`);
  console.log(`Issues found: ${results.improvements.length}`);
  
  if (results.improvements.length > 0) {
    console.log('\n🔧 RECOMMENDED IMPROVEMENTS:');
    results.improvements.forEach((improvement, index) => {
      console.log(`${index + 1}. [${improvement.priority.toUpperCase()}] ${improvement.type}: ${improvement.issue}`);
      console.log(`   💡 ${improvement.suggestion}`);
      if (improvement.page) console.log(`   📍 Page: ${improvement.page}`);
      if (improvement.viewport) console.log(`   📱 Viewport: ${improvement.viewport}`);
      console.log('');
    });
  }

  // Save detailed report
  const reportPath = path.join(__dirname, 'visual-review-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`📄 Detailed report saved to: ${reportPath}`);

  return results;
}

function getAccessibilitySuggestion(issue) {
  const suggestions = {
    'No heading structure found': 'Add proper heading hierarchy (h1, h2, h3) for screen readers',
    'Images without alt text detected': 'Add descriptive alt attributes to all images',
    'No skip navigation links found': 'Add skip links for keyboard navigation users'
  };
  return suggestions[issue] || 'Review accessibility guidelines';
}

runVisualReview().catch(console.error);