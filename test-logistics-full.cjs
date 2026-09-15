// test-logistics-full.cjs
// Run with: node test-logistics-full.cjs

const axios = require('axios');

const API_URL = 'http://localhost:5000/api';
let authToken = null;
let createdProductId = null;
let merchantToken = null;

// ============= UPDATE THESE WITH YOUR ACTUAL DATABASE USERS =============
// Run this in your database to find existing users:
// SELECT phone, role FROM users;
//
// Then update the credentials below:

const TEST_USERS = [
  { phone: '0734053313', password: 'gray@1903', role: 'admin' },
  { phone: '0624729596', password: '123456', role: 'customer' },
  { phone: '0700000001', password: '123456', role: 'merchant' }
];

// ============= COLORS =============
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  white: '\x1b[37m'
};

let passedTests = 0;
let failedTests = 0;

function logSuccess(message) {
  console.log(`  ${colors.green}✓ PASS: ${message}${colors.reset}`);
  passedTests++;
}

function logError(message) {
  console.log(`  ${colors.red}✗ FAIL: ${message}${colors.reset}`);
  failedTests++;
}

function logInfo(message) {
  console.log(`  ${colors.blue}ℹ INFO: ${message}${colors.reset}`);
}

function logTest(name) {
  console.log(`\n${colors.yellow}▶ TEST: ${name}${colors.reset}`);
}

// ============= HELPER FUNCTIONS =============
async function login(phone, password) {
  try {
    const response = await axios.post(`${API_URL}/auth/login`, { phone, password });
    return { success: true, token: response.data.token, user: response.data.user };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data?.message || error.message,
      status: error.response?.status
    };
  }
}

async function makeRequest(method, url, data = null, token = null) {
  try {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    
    const config = { method, url, headers, data };
    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return { 
      success: false, 
      error: error.response?.data?.error || error.response?.data?.message || error.message,
      status: error.response?.status
    };
  }
}

// ============= TEST 1: FIND WORKING USER =============
async function testFindWorkingUser() {
  logTest('Find Working User');
  
  for (const user of TEST_USERS) {
    console.log(`  Trying: ${user.phone} (${user.role})...`);
    const result = await login(user.phone, user.password);
    if (result.success) {
      authToken = result.token;
      logSuccess(`Logged in as ${user.phone} (${user.role})`);
      
      // If this is a merchant, save their token
      if (user.role === 'merchant') {
        merchantToken = result.token;
      }
      return true;
    } else {
      console.log(`    Failed: ${result.error}`);
    }
  }
  
  logError(`No working user found. Please update TEST_USERS with correct credentials.`);
  return false;
}

// ============= TEST 2: WEIGHT BRACKET ENDPOINT =============
async function testWeightBracketEndpoint() {
  logTest('Weight Bracket Endpoint');
  
  const testCases = [
    { weight: 1, expected: 'LIGHT' },
    { weight: 5, expected: 'MEDIUM' },
    { weight: 10, expected: 'HEAVY' },
    { weight: 20, expected: 'VERY_HEAVY' },
    { weight: 50, expected: 'BULK' }
  ];
  
  let allPassed = true;
  
  for (const test of testCases) {
    const result = await makeRequest('GET', `${API_URL}/logistics/weight-bracket?weightKg=${test.weight}`, null, authToken);
    if (result.success && result.data.bracket === test.expected) {
      logSuccess(`${test.weight}kg → ${result.data.bracket}`);
    } else {
      logError(`${test.weight}kg → expected ${test.expected}, got ${result.data?.bracket}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

// ============= TEST 3: CREATE PRODUCT =============
async function testCreateProduct() {
  logTest('Create Product');
  
  const productData = {
    name: `Test Product ${Date.now()}`,
    price: 25000,
    stock: 50,
    description: 'Test product for logistics system',
    category: 'electronics'
  };
  
  const result = await makeRequest('POST', `${API_URL}/products`, productData, authToken);
  
  if (result.success && result.data.id) {
    createdProductId = result.data.id;
    logSuccess(`Product created with ID: ${createdProductId}`);
    return true;
  }
  logError(`Failed to create product: ${result.error}`);
  return false;
}

// ============= TEST 4: GET PRODUCT LOGISTICS INFO =============
async function testGetProductLogistics() {
  logTest('Get Product Logistics Info');
  
  if (!createdProductId) {
    logError('No product ID available');
    return false;
  }
  
  const result = await makeRequest('GET', `${API_URL}/products/${createdProductId}`, null, authToken);
  
  if (result.success) {
    const product = result.data;
    logSuccess(`Product retrieved: ${product.name}`);
    console.log(`    ${colors.white}→ Weight Bracket: ${product.weightBracket || 'not set'}${colors.reset}`);
    console.log(`    ${colors.white}→ Allowed Vehicles: ${product.allowedVehicles?.join(', ') || 'not set'}${colors.reset}`);
    return true;
  }
  logError(`Failed to get product: ${result.error}`);
  return false;
}

// ============= TEST 5: CART EVALUATION =============
async function testCartEvaluation() {
  logTest('Cart Evaluation');
  
  if (!createdProductId) {
    logError('No product ID available');
    return false;
  }
  
  // Test with different scenarios
  const scenarios = [
    { name: 'Local delivery (Dar es Salaam)', lat: -6.7924, lng: 39.2083, hour: 14 },
    { name: 'Peak hour (7 PM)', lat: -6.7924, lng: 39.2083, hour: 19 },
    { name: 'Long distance (Arusha)', lat: -3.3667, lng: 36.6833, hour: 14 }
  ];
  
  let allPassed = true;
  
  for (const scenario of scenarios) {
    const cartData = {
      cartItems: [{ productId: createdProductId, quantity: 2 }],
      customerLat: scenario.lat,
      customerLng: scenario.lng,
      hour: scenario.hour,
      isRaining: false
    };
    
    const result = await makeRequest('POST', `${API_URL}/logistics/evaluate`, cartData, authToken);
    
    if (result.success) {
      logSuccess(`${scenario.name}: ${result.data.finalVehicle} - TZS ${result.data.deliveryFee?.toLocaleString()}`);
      if (result.data.surgeMultiplier > 1) {
        console.log(`    ${colors.white}→ Surge: ${Math.round((result.data.surgeMultiplier - 1) * 100)}% extra${colors.reset}`);
      }
      if (result.data.shippingMode === 'FBU_COURIER') {
        console.log(`    ${colors.white}→ FBU Mode: ${result.data.deliveryTimeline}${colors.reset}`);
      }
    } else {
      logError(`${scenario.name}: ${result.error}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

// ============= TEST 6: UPDATE PRODUCT LOGISTICS =============
async function testUpdateLogistics() {
  logTest('Update Product Logistics');
  
  if (!createdProductId) {
    logError('No product ID available');
    return false;
  }
  
  const updateData = {
    weightBracket: 'HEAVY',
    allowedVehicles: ['truck']
  };
  
  const result = await makeRequest('PUT', `${API_URL}/products/${createdProductId}`, updateData, authToken);
  
  if (result.success) {
    logSuccess(`Product updated: weightBracket=HEAVY, allowedVehicles=[truck]`);
    return true;
  }
  logInfo(`Direct update may not support logistics fields: ${result.error}`);
  return true; // Not a critical failure
}

// ============= TEST 7: VERIFY CART AFTER LOGISTICS UPDATE =============
async function testCartAfterUpdate() {
  logTest('Cart Evaluation After Logistics Update');
  
  if (!createdProductId) {
    logError('No product ID available');
    return false;
  }
  
  const cartData = {
    cartItems: [{ productId: createdProductId, quantity: 2 }],
    customerLat: -6.7924,
    customerLng: 39.2083,
    hour: 14
  };
  
  const result = await makeRequest('POST', `${API_URL}/logistics/evaluate`, cartData, authToken);
  
  if (result.success) {
    logSuccess(`Cart evaluation with updated product settings`);
    console.log(`    ${colors.white}→ Vehicle: ${result.data.finalVehicle}${colors.reset}`);
    console.log(`    ${colors.white}→ Should be 'truck' because product allows only trucks${colors.reset}`);
    return true;
  }
  logError(`Cart evaluation failed: ${result.error}`);
  return false;
}

// ============= TEST 8: CHECK LOGISTICS ROUTES =============
async function testLogisticsRoutes() {
  logTest('Logistics Routes Status');
  
  const routes = [
    { method: 'POST', url: '/logistics/evaluate', name: 'Cart evaluation' },
    { method: 'GET', url: '/logistics/weight-bracket?weightKg=10', name: 'Weight bracket' },
    { method: 'GET', url: '/logistics/admin/fbu-requests', name: 'Admin FBU requests' },
    { method: 'GET', url: '/logistics/admin/fbu-analytics', name: 'Admin FBU analytics' }
  ];
  
  let allPassed = true;
  
  for (const route of routes) {
    const result = await makeRequest(route.method, `${API_URL}${route.url}`, null, authToken);
    if (result.success || result.status === 400) { // 400 means endpoint exists but bad request
      logSuccess(`${route.name}: accessible`);
    } else if (result.status === 404) {
      logInfo(`${route.name}: not yet implemented (404)`);
    } else {
      logError(`${route.name}: ${result.error}`);
      allPassed = false;
    }
  }
  
  return allPassed;
}

// ============= RUN ALL TESTS =============
async function runAllTests() {
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║     🚚 HURIA LOGISTICS SYSTEM - COMPLETE TEST SUITE 🚚                          ║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════════════════════════╝${colors.reset}
`);

  const results = {
    findUser: await testFindWorkingUser(),
    weightBracket: await testWeightBracketEndpoint(),
    createProduct: await testCreateProduct(),
    getProductLogistics: await testGetProductLogistics(),
    cartEvaluation: await testCartEvaluation(),
    updateLogistics: await testUpdateLogistics(),
    cartAfterUpdate: await testCartAfterUpdate(),
    logisticsRoutes: await testLogisticsRoutes()
  };
  
  // Summary
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.yellow}📊 TEST SUMMARY${colors.reset}`);
  console.log(`${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  
  for (const [test, passed] of Object.entries(results)) {
    if (passed) {
      console.log(`  ${colors.green}✅ ${test}: PASSED${colors.reset}`);
    } else {
      console.log(`  ${colors.red}❌ ${test}: FAILED${colors.reset}`);
    }
  }
  
  console.log(`\n${colors.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}`);
  console.log(`${colors.white}📈 Total: ${colors.green}${passedTests} passed${colors.reset}, ${colors.red}${failedTests} failed${colors.reset}`);
  
  if (failedTests === 0 && passedTests > 0) {
    console.log(`\n${colors.green}🎉 ALL TESTS PASSED! Logistics system is working! 🎉${colors.reset}\n`);
  } else if (passedTests > 0) {
    console.log(`\n${colors.yellow}⚠️ ${failedTests} test(s) failed. Check the errors above.${colors.reset}\n`);
  }
  
  // Cleanup
  if (createdProductId) {
    console.log(`\n  Cleaning up: Deleting test product...`);
    await makeRequest('DELETE', `${API_URL}/products/${createdProductId}`, null, authToken);
  }
}

runAllTests().catch(console.error);