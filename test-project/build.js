console.log("========================================");
console.log("ReliAI cancellation test build started");
console.log("========================================");

let seconds = 0;

const timer = setInterval(() => {
    seconds++;

    console.log(
        `[LONG BUILD] Running... ${seconds}s`
    );

    if (seconds >= 120) {
        clearInterval(timer);

        console.log(
            "[LONG BUILD] Long build completed successfully."
        );

        process.exit(0);
    }
}, 1000);

// ------------------------------------------------------
// Handle termination signals
// ------------------------------------------------------

process.on("SIGTERM", () => {
    console.log(
        "[LONG BUILD] Cancellation signal received (SIGTERM)."
    );

    clearInterval(timer);

    process.exit(143);
});

process.on("SIGINT", () => {
    console.log(
        "[LONG BUILD] Interrupt signal received (SIGINT)."
    );

    clearInterval(timer);

    process.exit(130);
});