const express = require("express");
const { exec } = require("child_process");
const fs = require("fs").promises;
const path = require("path");

const app = express();
app.use(express.json());

const port = process.argv[2] || 3000; // Use the provided port or default to 3000
if (isNaN(port) || port < 1 || port > 65535) {
  console.error(
    "Invalid port number. Please provide a valid port (1-65535) as a command-line argument."
  );
  process.exit(1);
}

const websiteName = process.argv[3] || "NoNameWebsite";

// Create a queue to handle requests one at a time
const requestQueue = [];
let isProcessingRequest = false;

const configFilePath = path.join("../", "update-config.json");
let config = null;

try {
  const configData = await fs.readFile(configFilePath, "utf8");
  config = JSON.parse(configData);
} catch (error) {
  console.error(`Error loading config file 'configFilePath'\n${error}`);
  process.exit(1);
}

// Helper function to execute a command in a directory
const executeCommand = async (command, directory) => {
  return new Promise((resolve, reject) => {
    const childProcess = exec(
      command,
      { cwd: directory },
      (error, stdout, stderr) => {
        if (error) {
          console.error(
            `Error executing command "${command}" in "${directory}":`,
            error
          );
          reject(error);
        }
        console.log(stdout);
        console.error(stderr);
        resolve();
      }
    );

    childProcess.on("exit", (code) => {
      if (code !== 0) {
        console.error(`Command "${command}" exited with code ${code}`);
        reject(new Error(`Command "${command}" exited with code ${code}`));
      }
    });
  });
};

// Middleware to add requests to the queue
app.use("/", async (req, res, next) => {
  try {
    // Add the request to the queue
    requestQueue.push({
      commands: config.commands,
      res,
    });

    // Process the queue if it's not already being processed
    if (!isProcessingRequest) {
      isProcessingRequest = true;
      processQueue();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Function to process the queue
const processQueue = async () => {
  if (requestQueue.length === 0) {
    isProcessingRequest = false;
    return;
  }

  const { commands, res } = requestQueue.shift();

  try {
    for (const { command, directory } of commands) {
      await executeCommand(command, path.join("../", directory));
    }

    res.status(200).json({ message: "Update commands completed successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    // Continue processing the queue
    processQueue();
  }
};

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
