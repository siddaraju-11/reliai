const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    console.log("Connecting to MongoDB...");

    // Never print MONGO_URI because it contains database credentials
    const conn = await mongoose.connect(process.env.MONGO_URI);

    console.log("✅ MongoDB Connected Successfully");
    console.log("Host:", conn.connection.host);
    console.log("Database:", conn.connection.name);
  } catch (error) {
    console.error("❌ MongoDB Connection Failed");
    console.error("Name:", error.name);
    console.error("Message:", error.message);

    // Avoid printing the full stack in normal startup logs
    // because connection errors may occasionally expose sensitive details
    if (process.env.NODE_ENV === "development") {
      console.error("Check your MongoDB Atlas credentials and network access.");
    }

    process.exit(1);
  }
};

module.exports = connectDB;