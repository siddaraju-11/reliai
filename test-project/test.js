console.log("ReliAI test execution started...");

const a = 10;
const b = 20;
const result = a + b;

if (result === 30) {
  console.log("TEST PASSED: Addition test");
} else {
  console.error("TEST FAILED: Addition test");
  process.exit(1);
}

console.log("All tests completed successfully.");