import Client, {
  CommitmentLevel,
  SubscribeRequest,
} from "./wrappers/yellowstone-wrapper.js";
import bs58 from "bs58";
import { Connection, PublicKey } from "@solana/web3.js";
import WebSocket from "ws";
import chalk from "chalk";
import readline from "readline";
import dotenv from "dotenv";

dotenv.config();

const GRPC_URL = process.env.GRPC_URL as string;
const GRPC_API_KEY = process.env.GRPC_API_KEY as string;
const HTTP_URL = process.env.HTTP_URL as string;
const WS_URL = process.env.WS_URL as string;
const TEST_DURATION = Number(process.env.TEST_DURATION as string);
const TEST_INTERVAL = Number(process.env.TEST_INTERVAL as string);

const TEST_GRPC_STREAM = Number(process.env.TEST_GRPC_STREAM);
const TEST_GRPC_CALLS = Number(process.env.TEST_GRPC_CALLS);
const TEST_WEBSOCKET_STREAM = Number(process.env.TEST_WEBSOCKET_STREAM);
const TEST_HTTP_CALLS = Number(process.env.TEST_HTTP_CALLS);

const checkEnvVariables = () => {
  const missingVars = [];
  if (!TEST_DURATION) missingVars.push("TEST_DURATION");
  if (!TEST_INTERVAL) missingVars.push("TEST_INTERVAL");

  if (missingVars.length > 0) {
    console.log(
      chalk.red(`Missing environment variable(s): ${missingVars.join(", ")}`)
    );
    process.exit(1);
  }
};

checkEnvVariables();

const COMMITMENT_LEVEL = "confirmed";
const X_TOKEN = GRPC_API_KEY;
const PING_INTERVAL_MS = 30_000; // 30s
const COPY_ACCOUNTS = ["SysvarC1ock11111111111111111111111111111111"];

export interface IResults {
  time: string;
  count: number;
  err: boolean;
}

function formatElapsedTime(seconds: number) {
  const units = [
    { label: "year", seconds: 31536000 },
    { label: "month", seconds: 2592000 },
    { label: "week", seconds: 604800 },
    { label: "day", seconds: 86400 },
    { label: "hour", seconds: 3600 },
    { label: "minute", seconds: 60 },
    { label: "second", seconds: 1 },
  ];

  let remainingSeconds = seconds;
  const parts: string[] = [];

  for (const unit of units) {
    if (remainingSeconds >= unit.seconds) {
      const value = Math.floor(remainingSeconds / unit.seconds);
      remainingSeconds %= unit.seconds;
      parts.push(`${value} ${unit.label}${value !== 1 ? "s" : ""}`);
    }
  }

  return parts.join(", ");
}

async function testGrpcStream(): Promise<IResults> {
  let elapsedTime = "0";
  let dataDetectedCount = 0;

  return new Promise<IResults>(async (resolve) => {
    try {
      const client = new Client(GRPC_URL, X_TOKEN, {});
      const stream = await client.subscribe();
      const startTime = Date.now();

      // Ping request object
      const pingRequest: SubscribeRequest = {
        ping: { id: 1 },
        accounts: {},
        accountsDataSlice: [],
        transactions: {},
        transactionsStatus: {},
        blocks: {},
        blocksMeta: {},
        entry: {},
        slots: {},
      };

      // Setup ping interval
      const pingInterval = setInterval(async () => {
        await new Promise<void>((resolve, reject) => {
          stream.write(pingRequest, (err: any) => {
            if (err === null || err === undefined) {
              resolve();
            } else {
              reject(err);
            }
          });
        });
      }, PING_INTERVAL_MS);

      // Handle stream data
      stream.on("data", (data) => {
        const ts = Date.now();
        const elapsed = Math.floor((ts - startTime) / 1000);
        elapsedTime = formatElapsedTime(elapsed);

        if (data.filters[0] === "txReq") {
          const accKeysBytes =
            data.transaction.transaction.transaction.message.accountKeys;
          const accountKeys = accKeysBytes.map((key: any) => bs58.encode(key));
          const txSig = bs58.encode(data.transaction.transaction.signature);
          let matchingAccount = "";

          accountKeys.forEach((account: any) => {
            if (COPY_ACCOUNTS.includes(account)) {
              dataDetectedCount += 1;
              console.log(
                `\n${new Date(ts).toUTCString()}: Matching account detected from gRPC connection!`
              );
              matchingAccount = account;
              console.log(
                `${new Date(ts).toUTCString()}: Account: ${matchingAccount}`
              );
              console.log(`${new Date(ts).toUTCString()}: Signature: ${txSig}`);
              console.log(
                `${new Date(ts).toUTCString()}: gRPC stream active for: ${elapsedTime}`
              );
              console.log(
                `${new Date(ts).toUTCString()}: gRPC data detected count: ${dataDetectedCount}\n`
              );
            }
          });
        } else if (data.pong) {
          console.log(
            `${new Date(ts).toUTCString()}: Processed ping response!`
          );
        }
      });

      // Handle stream error
      stream.on("error", (err: any) => {
        console.log(`Stream ERROR: ${err.message}`);
        clearInterval(pingInterval);
        stream.removeAllListeners();
        if (dataDetectedCount > 0) {
          resolve({ time: elapsedTime, count: dataDetectedCount, err: true });
        } else {
          resolve({ time: "-1", count: -1, err: true });
        }
      });

      // Initial account request
      const accountRequest: SubscribeRequest = {
        slots: {},
        commitment: CommitmentLevel.CONFIRMED,
        accounts: {},
        accountsDataSlice: [],
        transactions: {
          txReq: {
            vote: undefined,
            failed: undefined,
            signature: undefined,
            accountInclude: COPY_ACCOUNTS,
            accountExclude: {},
            accountRequired: {},
          },
        },
        transactionsStatus: {},
        blocks: {},
        blocksMeta: {},
        entry: {},
      };

      stream.write(accountRequest, (err: any) => {
        if (err) {
          throw err;
        }
      });

      // Handle ping interval write
      new Promise<void>((resolve, reject) => {
        stream.write(pingRequest, (err: any) => {
          if (err === null || err === undefined) {
            resolve();
          } else {
            reject(err);
          }
        });
      });

      setTimeout(() => {
        clearInterval(pingInterval);
        stream
          .removeAllListeners()
          .once("error", () => {
            resolve({
              time: elapsedTime,
              count: dataDetectedCount,
              err: false,
            });
          })
          .cancel();
        resolve({ time: elapsedTime, count: dataDetectedCount, err: false });
      }, TEST_DURATION * 1000);
    } catch (e: any) {
      console.log(`ERROR: ${e.message}`);
      if (dataDetectedCount > 0) {
        resolve({ time: elapsedTime, count: dataDetectedCount, err: true });
      } else {
        resolve({ time: "-1", count: -1, err: true });
      }
    }
  });
}

async function testGrpcCalls() {
  const startTime = Date.now();
  let callsMade = 0;
  let elapsedTime = "0";

  try {
    const client = new Client(GRPC_URL, X_TOKEN, {});

    while (true) {
      const ts = Date.now();
      const elapsed = Math.floor((ts - startTime) / 1000);
      elapsedTime = formatElapsedTime(elapsed);

      if (TEST_DURATION > 0) {
        if (elapsed > TEST_DURATION) {
          return { time: elapsedTime, count: callsMade, err: false };
        }
      }

      try {
        const latestBlockhash = await client.getLatestBlockhash();
        callsMade += 1;

        console.log(
          `\n${new Date(ts).toUTCString()}: Latest blockhash received from gRPC call!`
        );
        console.log(
          `${new Date(ts).toUTCString()}: Latest blockhash from chain: ${latestBlockhash.blockhash}`
        );
        console.log(
          `${new Date(ts).toUTCString()}: gRPC calls active for: ${elapsedTime}`
        );
        console.log(
          `${new Date(ts).toUTCString()}: gRPC calls made: ${callsMade}\n`
        );
      } catch (error) {
        console.error(`HTTP Error: ${error}`);
        if (callsMade > 0) {
          return { time: elapsedTime, count: callsMade, err: true };
        } else {
          return { time: "-1", count: -1, err: true };
        }
      }
    }
  } catch (e: any) {
    console.log(`ERROR: ${e}`);
    if (callsMade > 0) {
      return { time: elapsedTime, count: callsMade, err: true };
    } else {
      return { time: "-1", count: -1, err: true };
    }
  }
}

async function testWebSocketStream(): Promise<IResults> {
  let elapsedTime = "0";
  let dataDetectedCount = 0;

  return new Promise<IResults>((resolve) => {
    try {
      const ws = new WebSocket(WS_URL);
      let websocketInitialize = true;
      let startTime: number;

      ws.on("open", () => {
        const request = {
          jsonrpc: "2.0",
          id: 1,
          method: "logsSubscribe",
          params: [{ mentions: COPY_ACCOUNTS }, { commitment: "finalized" }],
        };

        ws.send(JSON.stringify(request));
        console.log(
          "\nWebSocket connection opened and subscription request sent"
        );
      });

      ws.on("message", (message) => {
        try {
          const responseDict = JSON.parse(message.toString());

          if ("result" in responseDict) {
            if (websocketInitialize) {
              websocketInitialize = false;
              console.log("WebSocket initialized\n");
              startTime = Date.now();
            }
          }

          if (responseDict.params?.result?.value?.err === null) {
            const ts = Date.now();
            const elapsed = Math.floor((ts - startTime) / 1000);
            elapsedTime = formatElapsedTime(elapsed);
            const txSig = responseDict.params.result.value.signature;
            dataDetectedCount += 1;
            console.log(
              `${new Date(ts).toUTCString()}: Matching account detected from WEBSOCKET connection!`
            );
            console.log(
              `${new Date(ts).toUTCString()}: Account: ${COPY_ACCOUNTS[0]}`
            );
            console.log(`${new Date(ts).toUTCString()}: Signature: ${txSig}`);
            console.log(
              `${new Date(ts).toUTCString()}: WebSocket stream active for: ${elapsedTime}`
            );
            console.log(
              `${new Date(ts).toUTCString()}: WebSocket data detected count: ${dataDetectedCount}\n`
            );
          } else {
            if (responseDict.params?.result?.value?.err) {
              console.warn(
                "Error in detected transaction... Skipping processing"
              );
            }
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
          ws.close();
          ws.removeAllListeners();
          if (dataDetectedCount > 0) {
            resolve({ time: elapsedTime, count: dataDetectedCount, err: true });
          } else {
            resolve({ time: "-1", count: -1, err: true });
          }
        }
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error.message);
        ws.close();
        ws.removeAllListeners();
        resolve({ time: "-1", count: -1, err: true }); // Resolve with error result
      });

      ws.on("close", (code, reason) => {
        ws.removeAllListeners();
        console.log(`WebSocket connection closed (code ${code}): ${reason}`);
        resolve({ time: elapsedTime, count: dataDetectedCount, err: false }); // Ensure resolve on close
      });

      setTimeout(() => {
        ws.close();
        ws.removeAllListeners();
        resolve({ time: elapsedTime, count: dataDetectedCount, err: false });
      }, TEST_DURATION * 1000);
    } catch (e: any) {
      console.log(`ERROR: ${e.message}`);
      if (dataDetectedCount > 0) {
        resolve({ time: elapsedTime, count: dataDetectedCount, err: false });
      } else {
        resolve({ time: "-1", count: -1, err: false });
      }
    }
  });
}

async function testHttpCalls() {
  const startTime = Date.now();
  let callsMade = 0;
  let elapsedTime = "0";

  return { time: "13", count: 2, err: true };

  try {
    const CONNECTION_HTTP = new Connection(HTTP_URL, {
      commitment: COMMITMENT_LEVEL,
    });

    while (true) {
      const ts = Date.now();
      const elapsed = Math.floor((ts - startTime) / 1000);
      elapsedTime = formatElapsedTime(elapsed);

      if (TEST_DURATION > 0) {
        if (elapsed > TEST_DURATION) {
          return { time: elapsedTime, count: callsMade, err: false };
        }
      }

      try {
        const sigsForAccount = await CONNECTION_HTTP.getSignaturesForAddress(
          new PublicKey(COPY_ACCOUNTS[0])
        );
        const latestAccountTx = sigsForAccount[0].signature;
        callsMade += 1;

        console.log(
          `\n${new Date(ts).toUTCString()}: Signatures for first copy account received from HTTP call!`
        );
        console.log(
          `${new Date(ts).toUTCString()}: Account: ${COPY_ACCOUNTS[0]}`
        );
        console.log(
          `${new Date(ts).toUTCString()}: Latest Signature from Account: ${latestAccountTx}`
        );
        console.log(
          `${new Date(ts).toUTCString()}: HTTP calls active for: ${elapsedTime}`
        );
        console.log(
          `${new Date(ts).toUTCString()}: HTTP calls made: ${callsMade}\n`
        );
      } catch (error) {
        console.error(`HTTP Error: ${error}`);
        if (callsMade > 0) {
          return { time: elapsedTime, count: callsMade, err: true };
        } else {
          return { time: "-1", count: -1, err: true };
        }
      }
    }
  } catch (e: any) {
    console.log(`ERROR: ${e}`);
    if (callsMade > 0) {
      return { time: elapsedTime, count: callsMade, err: true };
    } else {
      return { time: "-1", count: -1, err: true };
    }
  }
}

async function runTests() {
  const startTime = Date.now();
  console.log(chalk.bold.yellow("\nConfiguration:\n"));
  console.log(chalk.yellow(`gRPC URL: ${GRPC_URL}`));
  console.log(chalk.yellow(`HTTP URL: ${HTTP_URL}`));
  console.log(chalk.yellow(`WebSocket URL: ${WS_URL}`));
  console.log(chalk.yellow(`Test Duration: ${TEST_DURATION} seconds`));
  console.log(chalk.yellow(`Test Interval: ${TEST_INTERVAL} seconds\n`));
  console.log(
    chalk.yellow(
      `Test gRPC Stream: ${TEST_GRPC_STREAM ? "Enabled" : "Disabled"}`
    )
  );
  console.log(
    chalk.yellow(`Test gRPC Calls: ${TEST_GRPC_CALLS ? "Enabled" : "Disabled"}`)
  );
  console.log(
    chalk.yellow(
      `Test WebSocket Stream: ${TEST_WEBSOCKET_STREAM ? "Enabled" : "Disabled"}`
    )
  );
  console.log(
    chalk.yellow(
      `Test HTTP Calls: ${TEST_HTTP_CALLS ? "Enabled" : "Disabled"}\n`
    )
  );

  const countdownInPlace = (message: string): Promise<void> => {
    return new Promise((resolve) => {
      let countdown = TEST_INTERVAL;
      const countdownInterval = setInterval(() => {
        readline.cursorTo(process.stdout, 0);
        process.stdout.write(chalk.blue(`${message} in ${countdown}s...`));
        countdown--;

        if (countdown < 0) {
          clearInterval(countdownInterval);
          process.stdout.write("\n"); // Move to the next line after countdown
          resolve();
        }
      }, 1000);
    });
  };

  let gRpcStreamResults: IResults = { time: "0", count: 0, err: false };
  let gRpcCallResults: IResults = { time: "0", count: 0, err: false };
  let httpCallResults: IResults = { time: "0", count: 0, err: false };
  let websocketStreamResults: IResults = { time: "0", count: 0, err: false };

  // gRPC Stream Test
  if (TEST_GRPC_STREAM) {
    await countdownInPlace("Starting gRPC Stream test");
    gRpcStreamResults = await testGrpcStream();
    if (gRpcStreamResults.err) {
      console.log(
        chalk.red(
          `gRPC Stream encountered an error, continuing with other endpoint tests...\n`
        )
      );
    } else {
      console.log(chalk.green(`gRPC Stream test completed!\n`));
    }
  }

  // gRPC Calls Test
  if (TEST_GRPC_CALLS) {
    await countdownInPlace("Starting gRPC Calls test");
    gRpcCallResults = await testGrpcCalls();
    if (gRpcCallResults.err) {
      console.log(
        chalk.red(
          `gRPC Calls encountered an error, continuing with other endpoint tests...\n`
        )
      );
    } else {
      console.log(chalk.green(`gRPC Calls test completed!\n`));
    }
  }

  // WebSocket Stream Test
  if (TEST_WEBSOCKET_STREAM) {
    await countdownInPlace("Starting WebSocket Stream test");
    websocketStreamResults = await testWebSocketStream();
    if (websocketStreamResults.err) {
      console.log(
        chalk.red(
          `WebSocket Stream encountered an error, continuing with other endpoint tests...\n`
        )
      );
    } else {
      console.log(chalk.green(`WebSocket Stream test completed!\n`));
    }
  }

  // HTTP Calls Test
  if (TEST_HTTP_CALLS) {
    await countdownInPlace("Starting HTTP Calls test");
    httpCallResults = await testHttpCalls();
    if (httpCallResults.err) {
      console.log(
        chalk.red(
          `HTTP Calls encountered an error, continuing with other endpoint tests...\n`
        )
      );
    } else {
      console.log(chalk.green(`HTTP Calls test completed!\n`));
    }
  }

  console.log(chalk.bold(`Test Results:\n`));

  if (TEST_GRPC_STREAM) {
    console.log(chalk.cyan(`gRPC Stream Results:`));
    console.log(
      `Run Time: ${
        !gRpcStreamResults.err && gRpcStreamResults.count > 0
          ? chalk.green(gRpcStreamResults.time)
          : gRpcStreamResults.err && gRpcStreamResults.count > 0
            ? chalk.hex("#FFA500")(`${gRpcStreamResults.time} - Error occurred`)
            : chalk.red("0 - Error occurred")
      }`
    );
    console.log(
      `Data Count: ${
        !gRpcStreamResults.err && gRpcStreamResults.count > 0
          ? chalk.green(gRpcStreamResults.count)
          : gRpcStreamResults.err && gRpcStreamResults.count > 0
            ? chalk.hex("#FFA500")(
                `${gRpcStreamResults.count} - Error occurred`
              )
            : chalk.red("0 - Error occurred")
      }\n`
    );
  }

  if (TEST_GRPC_CALLS) {
    console.log(chalk.cyan(`gRPC Call Results:`));
    console.log(
      `Run Time: ${
        !gRpcCallResults.err && gRpcCallResults.count > 0
          ? chalk.green(gRpcCallResults.time)
          : gRpcCallResults.err && gRpcCallResults.count > 0
            ? chalk.hex("#FFA500")(`${gRpcCallResults.time} - Error occurred`)
            : chalk.red("0 - Error occurred")
      }`
    );
    console.log(
      `Data Count: ${
        !gRpcCallResults.err && gRpcCallResults.count > 0
          ? chalk.green(gRpcCallResults.count)
          : gRpcCallResults.err && gRpcCallResults.count > 0
            ? chalk.hex("#FFA500")(`${gRpcCallResults.count} - Error occurred`)
            : chalk.red("0 - Error occurred")
      }\n`
    );
  }

  if (TEST_WEBSOCKET_STREAM) {
    console.log(chalk.cyan(`WebSocket Stream Results:`));
    console.log(
      `Run Time: ${
        !websocketStreamResults.err && websocketStreamResults.count > 0
          ? chalk.green(websocketStreamResults.time)
          : websocketStreamResults.err && websocketStreamResults.count > 0
            ? chalk.hex("#FFA500")(
                `${websocketStreamResults.time} - Error occurred`
              )
            : chalk.red("0 - Error occurred")
      }`
    );
    console.log(
      `Data Count: ${
        !websocketStreamResults.err && websocketStreamResults.count > 0
          ? chalk.green(websocketStreamResults.count)
          : websocketStreamResults.err && websocketStreamResults.count > 0
            ? chalk.hex("#FFA500")(
                `${websocketStreamResults.count} - Error occurred`
              )
            : chalk.red("0 - Error occurred")
      }\n`
    );
  }

  if (TEST_HTTP_CALLS) {
    console.log(chalk.cyan(`HTTP Call Results:`));
    console.log(
      `Run Time: ${
        !httpCallResults.err && httpCallResults.count > 0
          ? chalk.green(httpCallResults.time)
          : httpCallResults.err && httpCallResults.count > 0
            ? chalk.hex("#FFA500")(`${httpCallResults.time} - Error occurred`)
            : chalk.red("0 - Error occurred")
      }`
    );
    console.log(
      `Data Count: ${
        !httpCallResults.err && httpCallResults.count > 0
          ? chalk.green(httpCallResults.count)
          : httpCallResults.err && httpCallResults.count > 0
            ? chalk.hex("#FFA500")(`${httpCallResults.count} - Error occurred`)
            : chalk.red("0 - Error occurred")
      }\n`
    );
  }

  console.log(chalk.bold.yellow(`Configuration used in tests:\n`));
  console.log(chalk.yellow(`gRPC URL: ${GRPC_URL}`));
  console.log(chalk.yellow(`HTTP URL: ${HTTP_URL}`));
  console.log(chalk.yellow(`WebSocket URL: ${WS_URL}`));
  console.log(chalk.yellow(`Test Duration: ${TEST_DURATION} seconds`));
  console.log(chalk.yellow(`Test Interval: ${TEST_INTERVAL} seconds\n`));
  console.log(
    chalk.yellow(
      `Test gRPC Stream: ${TEST_GRPC_STREAM ? "Enabled" : "Disabled"}`
    )
  );
  console.log(
    chalk.yellow(`Test gRPC Calls: ${TEST_GRPC_CALLS ? "Enabled" : "Disabled"}`)
  );
  console.log(
    chalk.yellow(
      `Test WebSocket Stream: ${TEST_WEBSOCKET_STREAM ? "Enabled" : "Disabled"}`
    )
  );
  console.log(
    chalk.yellow(
      `Test HTTP Calls: ${TEST_HTTP_CALLS ? "Enabled" : "Disabled"}\n`
    )
  );

  const endTime = Date.now();
  const elapsedTime = formatElapsedTime(
    Math.floor((endTime - startTime) / 1000)
  );
  console.log(chalk.green(`Done in ${elapsedTime}`));
}

runTests();
