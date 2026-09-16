const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const monitorDirectory = path.resolve(__dirname, "..", "ServerMonitor");
const healthFile = path.join(monitorDirectory, "monitor_output", "health.json");

let monitorProcess = null;

function ensureMonitorRunning() {
    if (monitorProcess && monitorProcess.exitCode === null) {
        return false;
    }

    const isWindows = process.platform === "win32";
    const command = isWindows ? "powershell.exe" : "bash";
    const args = isWindows
        ? ["-ExecutionPolicy", "Bypass", "-File", "./monitor_health_checker_db.ps1"]
        : ["./monitor.sh"];

    monitorProcess = spawn(command, args, {
        cwd: monitorDirectory,
        detached: true,
        stdio: "ignore",
        windowsHide: isWindows
    });

    monitorProcess.unref();
    monitorProcess.on("error", (error) => {
        console.error("Unable to start ServerMonitor:", error.message);
        monitorProcess = null;
    });
    monitorProcess.on("exit", () => {
        monitorProcess = null;
    });

    return true;
}

function readHealth() {
    if (!fs.existsSync(healthFile)) return null;

    try {
        const contents = fs
            .readFileSync(healthFile, "utf8")
            .replace(/^\uFEFF/, "");

        return JSON.parse(contents);
    } catch (error) {
        if (error instanceof SyntaxError) return null;
        throw error;
    }
}

async function readFreshHealth(previousTimestamp) {
    let latestHealth = null;

    for (let attempt = 0; attempt < 12; attempt += 1) {
        const health = readHealth();
        if (health) {
            latestHealth = health;
            if (health.timestamp !== previousTimestamp) return health;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return latestHealth;
}

async function getHealth(req, res) {
    try {
        const currentHealth = readHealth();
        const monitorStarted = ensureMonitorRunning();

        // On the first click, wait for the newly started script to publish its
        // first result instead of showing an old file from a previous session.
        const health = monitorStarted
            ? await readFreshHealth(currentHealth?.timestamp)
            : currentHealth || await readFreshHealth();
        if (!health) {
            return res.status(503).json({
                message: "Health monitor is starting. Please try again shortly."
            });
        }

        return res.json(health);
    } catch (error) {
        console.error("Unable to read health.json:", error);
        return res.status(500).json({
            message: "Unable to read health monitor output",
            error: error.message
        });
    }
}

module.exports = { getHealth };