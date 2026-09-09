const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const monitorDirectory = path.resolve(__dirname, "..", "..", "ServerMonitor");
const healthFile = path.join(monitorDirectory, "monitor_output", "health.json");

let monitorProcess = null;

function ensureMonitorRunning() {
    if (monitorProcess && monitorProcess.exitCode === null) return;

    monitorProcess = spawn(
        "powershell.exe",
        ["-ExecutionPolicy", "Bypass", "-File", "./monitor.ps1"],
        { cwd: monitorDirectory, detached: true, stdio: "ignore", windowsHide: true }
    );

    monitorProcess.unref();
    monitorProcess.on("error", (error) => {
        console.error("Unable to start ServerMonitor:", error.message);
        monitorProcess = null;
    });
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
        const previousHealth = readHealth();
        ensureMonitorRunning();

        const health = await readFreshHealth(previousHealth?.timestamp);
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