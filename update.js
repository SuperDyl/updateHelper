const express = require("express");
const expressQueue = require("express-queue");
const { exec } = require("child_process");
const fs = require("fs").promises;
const path = require("path");

const yargs = require("yargs");

const options = yargs
  .option("port", {
    alias: "p",
    describe: "The port the server listens on",
    type: "number",
    check: (port) => {
      if (port < 1 || port > 65535) {
        throw new Error("Port must be between 1 and 65535");
      }
      return true;
    },
  })
  .option("serverName", {
    alias: "l",
    describe: "A name used in logs to represent this service",
    type: "string",
  })
  .option("configPath", {
    alias: "c",
    describe:
      "path to the config file (assumed to be relative to the parent directory of updateHelper)",
    type: "string",
    default: "update-config.json",
  })
  .demandOption(["port", "serverName"]).argv;

const port = options.port;
const serverName = options.serverName;
const configFilePath = path.join("../", options.configPath);

const app = express();
app.use(express.json());
app.use(expressQueue({ activeLimit: 1, queuedLimit: 2 }));

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
    const { stdout, stderr } = await executeCommand(
      `pm2 restart ${serverName}`,
      "../"
    );
    //should be unreachable!
    console.error(stderr);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
