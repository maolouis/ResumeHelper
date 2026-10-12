const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

const executable = process.argv[2];
if (!executable) throw new Error("Usage: node tests/test_native_host_exe.js <ResumeHelperHost.exe>");
const expectEmpty = process.argv.includes("--expect-empty");

function request(action) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [], { stdio: ["pipe", "pipe", "pipe"] });
    const payload = Buffer.from(JSON.stringify({ action }), "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length);
    const chunks = [];
    const errors = [];
    child.stdout.on("data", (chunk) => chunks.push(chunk));
    child.stderr.on("data", (chunk) => errors.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        const output = Buffer.concat(chunks);
        assert.ok(output.length >= 4, `Native host returned no framed response: ${Buffer.concat(errors)}`);
        const length = output.readUInt32LE(0);
        assert.ok(output.length >= length + 4, "Native host response frame is incomplete");
        const response = JSON.parse(output.subarray(4, length + 4).toString("utf8"));
        assert.equal(response.ok, true, response.error);
        resolve(response);
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(Buffer.concat([header, payload]));
  });
}

async function main() {
  const ping = await request("ping");
  assert.equal(ping.version, "0.4.5");
  const state = await request("get_state");
  if (expectEmpty) {
    assert.equal(state.active_profile_id, "");
    assert.equal(state.active_profile, null);
    assert.deepEqual(state.profiles, []);
    console.log(`Native host integration passed (version ${ping.version}, empty profile state)`);
  } else {
    assert.ok(state.active_profile_id);
    assert.ok(state.active_profile);
    console.log(`Native host integration passed (version ${ping.version}, profile ${state.active_profile.name})`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
