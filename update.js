const express = require("express");
const expressQueue = require("express-queue");
const { exec } = require("child_process");
const fs = require("fs").promises;
const path = require("path");

/*
Setup:
pm2 start update.js --name SOME_NAME -- PORT WEBSITE
Optionally, you can include CONFIG_PATH as the final argument. Path should be from project ROOT

Config example: (store as update-config.json in the root folder)
{
  commands: [
    {
      command: "git pull",
      directory: "./",
      failOnText: Already up to date.",
    },
    {
      command: "npm install",
      directory: "back-end",
    },
    {
      command: "npm install",
      directory: "front-end",
    },
    {
      command: "npm run build",
      directory: "front-end",
    },
  ],
}
*/

const app = express();
app.use(express.json());
app.use(expressQueue({ activeLimit: 1, queuedLimit: 2 }));

const port = process.argv[2] || 3000; // Use the provided port or default to 3000
if (isNaN(port) || port < 1 || port > 65535) {
  console.error(
    "Invalid port number. Please provide a valid port (1-65535) as a command-line argument."
  );
  process.exit(1);
}

const websiteName = process.argv[3] || "NoNameWebsite";
const configFilePath = process.argv[4] || "update-config.json";

const configFilePath = path.join("../", configFilePath);
let config = null;

try {
  const configData = await fs.readFile(configFilePath, "utf8");
  config = JSON.parse(configData);
} catch (error) {
  console.error(`Error loading config file '${configFilePath}'`, error);
  process.exit(1);
}

// Helper function to execute a command in a directory
const executeCommand = async (command, directory) => {
  return new Promise((resolve, reject) => {
    const childProcess = exec(
      command,
      { cwd: directory },
      (error, stdout, stderr) => {
        console.log(stdout);
        console.error(stderr);
        if (!error) {
          resolve({ stdout, stderr });
          return;
        }
        //else
        console.error(
          `Error executing command "${command}" in "${directory}":`,
          error
        );
        reject(error);
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

// Function to process the queue
const processCommands = async (commands, res) => {
  for (const { command, directory, failOnText } of commands) {
    const { stdout } = await executeCommand(
      command,
      path.join("../", directory)
    );

    if (failOnText !== undefined && stdout.includes(failOnText)) {
      reject(
        new Error(
          `Extra fail case occurred of '${failOnText}' for command '${command}'`
        )
      );
    }
  }
};

app.post("/", async (req, res, next) => {
  try {
    const { commands } = config;
    processCommands(commands, res);
    res.status(200).json({ message: "Update commands completed successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
