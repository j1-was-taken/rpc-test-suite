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
import fetch from "node-fetch";
import dnsPromise from "dns/promises";
import dns from "dns";
import { URL } from "url"; // URL module to easily handle URL parsing

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

const ERROR_LEVEL = process.env.ERROR_LEVEL;

const checkEnvVariables = () => {
  const missingVars: any[] = [];

  // Check if the value is undefined and log only missing variables
  const logEnvVar = (varName: string, value: string | undefined) => {
    if (value === undefined) {
      missingVars.push(varName);
      console.log(`${chalk.red(varName)}: ${chalk.red("undefined")}`);
    }
  };

  logEnvVar("GRPC_URL", process.env.GRPC_URL);
  logEnvVar("GRPC_API_KEY", process.env.GRPC_API_KEY);
  logEnvVar("HTTP_URL", process.env.HTTP_URL);
  logEnvVar("WS_URL", process.env.WS_URL);
  logEnvVar("TEST_DURATION", process.env.TEST_DURATION);
  logEnvVar("TEST_INTERVAL", process.env.TEST_INTERVAL);
  logEnvVar("TEST_GRPC_STREAM", process.env.TEST_GRPC_STREAM);
  logEnvVar("TEST_GRPC_CALLS", process.env.TEST_GRPC_CALLS);
  logEnvVar("TEST_WEBSOCKET_STREAM", process.env.TEST_WEBSOCKET_STREAM);
  logEnvVar("TEST_HTTP_CALLS", process.env.TEST_HTTP_CALLS);
  logEnvVar("ERROR_LEVEL", process.env.ERROR_LEVEL);

  if (missingVars.length > 0) {
    console.log(chalk.red("\nMissing environment variables:"));
    missingVars.forEach((variable) => {
      console.log(chalk.red(`- ${variable}: undefined`));
    });
    process.exit(1);
  }
};

checkEnvVariables();

const COMMITMENT_LEVEL = "confirmed";
const X_TOKEN = GRPC_API_KEY;
const PING_INTERVAL_MS = 30000; // 30s
const COPY_ACCOUNTS = ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"];

let shouldPing = true;

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

async function checkServerMaintenance(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "curl/8.4.0", // Match curl for consistency
        Accept: "*/*",
      },
    });

    // Check if server responds with a 503 status (Service Unavailable)
    if (response.status === 503) {
      const body = await response.text();
      if (body.includes("Service under maintenance")) {
        if (ERROR_LEVEL == "stack") {
          console.log(response);
          console.log(body);
        } else {
          console.log("Server is under maintenance. HTTP Status: 503");
        }

        return true; // Server is under maintenance
      }
    }
  } catch (error: any) {}

  return false; // Server is not under maintenance
}

async function getIpFromUrl(url: string): Promise<string | null> {
  // Parse URL and extract hostname
  const parsedUrl = new URL(url);
  const host = parsedUrl.hostname;

  return new Promise<string | null>((resolve, reject) => {
    // DNS lookup to get the IP address
    dns.lookup(host, (err: any, address: any) => {
      if (err) {
        reject(err); // Reject with error
      } else {
        resolve(address);
      }
    });
  });
}

// Function to fetch location info from IP
async function getLocationForIp(ip: string): Promise<any> {
  // Fetch location data from ipinfo.io
  const response = await fetch(`https://ipinfo.io/${ip}/json`);
  const locationData: any = await response.json();

  // Attempt to fetch the hostname using reverse DNS if not available
  if (!locationData.hostname) {
    try {
      const hostnames = await dnsPromise.reverse(ip);
      locationData.hostname = hostnames[0] || null; // Add hostname if found
    } catch (error) {
      locationData.hostname = null; // Handle reverse DNS failure gracefully
    }
  }

  if (locationData && locationData.loc) {
    return locationData; // Return location data if available
  } else {
    return null; // No location available
  }
}

// Function to check multiple URLs for valid locations
async function checkUrlsForLocation(urls: string[]): Promise<string[]> {
  const resultMessages: string[] = []; // Array to hold all result messages

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    let ip: string | null;
    let location: any;

    // Resolve the IP of the URL
    try {
      ip = await getIpFromUrl(url);
    } catch (error) {
      resultMessages.push(
        chalk.yellow(`${url} -> `) +
          chalk.red("No location found, check the endpoint")
      );
      continue; // Continue with the next URL if IP fetch fails
    }

    if (ip == null) {
      resultMessages.push(
        chalk.yellow(`${url} -> `) + chalk.red("IP resolution failed")
      );
      continue; // If IP is null, continue with the next URL
    }

    // Fetch location for the resolved IP
    try {
      location = await getLocationForIp(ip);
    } catch (error) {
      resultMessages.push(
        chalk.yellow(`${url} -> `) +
          chalk.red("No location found, check the endpoint")
      );
      continue; // Continue with the next URL if location fetch fails
    }

    if (location) {
      // Add the result message with location details (Location in green)
      resultMessages.push(
        chalk.yellow(`${url} -> `) +
          chalk.green(
            `${location.city}, ${location.region}, ${
              location.country
            } ${chalk.yellow("->")} ${location.org} ${chalk.yellow("->")} ${
              location.hostname ? location.hostname : chalk.red("Unknown")
            }`
          )
      );
    } else {
      resultMessages.push(
        chalk.yellow(`${url} -> `) + chalk.red("Location info unavailable")
      );
    }
  }

  if (resultMessages.length === 0) {
    resultMessages.push("No valid locations found for any of the URLs.");
  }

  return resultMessages; // Return all result messages
}

async function logConfig(locations: string[]) {
  console.log(chalk.bold.yellow(`Setup`));
  console.log(chalk.bold.yellow());
  console.log(
    chalk.bold.yellow(`Endpoint -> Location -> Organization -> Host`)
  );

  locations.forEach((message) => {
    console.log(message);
  });

  console.log();

  console.log(chalk.bold.yellow(`Timing`));
  console.log(
    chalk.yellow(`Test Duration: `) + chalk.green(`${TEST_DURATION} seconds`)
  );
  console.log(
    chalk.yellow(`Test Interval: `) + chalk.green(`${TEST_INTERVAL} seconds\n`)
  );

  console.log(chalk.bold.yellow(`Tests`));
  console.log(
    chalk.yellow(
      `Test gRPC Stream: ${
        TEST_GRPC_STREAM ? chalk.green("Enabled") : chalk.red("Disabled")
      }`
    )
  );

  console.log(
    chalk.yellow(
      `Test gRPC Calls: ${
        TEST_GRPC_CALLS ? chalk.green("Enabled") : chalk.red("Disabled")
      }`
    )
  );
  console.log(
    chalk.yellow(
      `Test WebSocket Stream: ${
        TEST_WEBSOCKET_STREAM ? chalk.green("Enabled") : chalk.red("Disabled")
      }`
    )
  );
  console.log(
    chalk.yellow(
      `Test HTTP Calls: ${
        TEST_HTTP_CALLS ? chalk.green("Enabled") : chalk.red("Disabled")
      }\n`
    )
  );
}

async function jankyInterval(
  callback: () => Promise<void>,
  interval: number
): Promise<void> {
  while (shouldPing) {
    try {
      await callback();
    } catch (err) {
      console.error("Error in jankyInterval:", err);
      throw err; // Optionally re-throw to stop execution
    }
    await new Promise((resolve) => setTimeout(resolve, interval)); // Delay for the interval
  }
}

async function testGrpcStream(): Promise<IResults> {
  let elapsedTime = "0";
  let dataDetectedCount = 0;

  const isServerUnderMaintenance = await checkServerMaintenance(GRPC_URL);
  if (isServerUnderMaintenance) {
    return { time: "-1", count: -1, err: true }; // If under maintenance, return early with error state
  }

  return new Promise<IResults>(async (resolve) => {
    try {
      const client = new Client(GRPC_URL, X_TOKEN, {
        "grpc.max_receive_message_length": 1024 * 1024 * 1024,
      });

      const stream = await client.subscribe();

      const startTime = Date.now();

      stream.on("error", (err: any) => {
        if (ERROR_LEVEL == "stack") {
          console.log(`gRPC Stream ERROR message: ${err.stack}`);
        } else {
          console.log(
            `gRPC Stream ERROR message: ${err.message.replace("\n", "")}`
          );
        }

        shouldPing = false;
        stream.removeAllListeners(); // Remove all listeners

        // Add a one-time error listener to handle any errors during cleanup
        stream.once("error", (error) => {
          console.log("Stream encountered an error during cleanup:", error);
          resolve({ time: elapsedTime, count: dataDetectedCount, err: false });
          if (dataDetectedCount > 0) {
            resolve({ time: elapsedTime, count: dataDetectedCount, err: true });
          } else {
            resolve({ time: "-1", count: -1, err: true });
          }
        });

        resolve({ time: elapsedTime, count: dataDetectedCount, err: false });
        if (dataDetectedCount > 0) {
          resolve({ time: elapsedTime, count: dataDetectedCount, err: true });
        } else {
          resolve({ time: "-1", count: -1, err: true });
        }
      });

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
                `\n${new Date(
                  ts
                ).toUTCString()}: Matching account detected from gRPC connection!`
              );
              matchingAccount = account;
              console.log(
                `${new Date(ts).toUTCString()}: Account: ${matchingAccount}`
              );
              console.log(`${new Date(ts).toUTCString()}: Signature: ${txSig}`);
              console.log(
                `${new Date(
                  ts
                ).toUTCString()}: gRPC stream active for: ${elapsedTime}`
              );
              console.log(
                `${new Date(
                  ts
                ).toUTCString()}: gRPC data detected count: ${dataDetectedCount}\n`
              );
            }
          });
        } else if (data.pong) {
          console.log(
            `${new Date(ts).toUTCString()}: Processed ping response!`
          );
        }
      });

      // Example subscribe request.
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

      jankyInterval(
        async () => {
          if (shouldPing) {
            // Simulate your async task (e.g., gRPC ping request)
            try {
              await new Promise<void>((resolve, reject) => {
                stream.write(pingRequest, (err: any) => {
                  if (err === null || err === undefined) {
                    resolve();
                  } else {
                    reject(err);
                  }
                });
              });
            } catch (err: any) {
              console.error("Failed to write to the stream:", err);
              resolve({
                time: elapsedTime,
                count: dataDetectedCount,
                err: false,
              });
            }
          }
        },
        PING_INTERVAL_MS // Interval in ms
      ).catch((err) => console.error("Interval stopped due to error:", err));

      // Send subscribe request
      await new Promise<void>((resolve, reject) => {
        stream.write(accountRequest, (err: any) => {
          if (err === null || err === undefined) {
            resolve();
          } else {
            reject(err);
          }
        });
      }).catch((reason) => {
        console.error(reason);
        throw reason;
      });

      setTimeout(() => {
        shouldPing = false;
        stream.removeAllListeners(); // Remove all listeners

        // Add a one-time error listener to handle any errors during cleanup
        stream.once("error", (error) => {
          console.log("Stream encountered an error during cleanup:", error);
          resolve({ time: elapsedTime, count: dataDetectedCount, err: false });
        });

        resolve({ time: elapsedTime, count: dataDetectedCount, err: false });
      }, TEST_DURATION * 1000);
    } catch (e: any) {
      if (ERROR_LEVEL == "stack") {
        console.log(`[TOP] gRPC Stream ERROR message: ${e.stack}`);
      } else {
        console.log(
          `[TOP] gRPC Stream ERROR message: ${e.message.replace("\n", "")}`
        );
      }

      if (dataDetectedCount > 0) {
        resolve({ time: elapsedTime, count: dataDetectedCount, err: true });
      } else {
        resolve({ time: "-1", count: -1, err: true });
      }
    }
  });

  // return new Promise<IResults>(async (resolve) => {
  //   try {
  //     const client = new Client(GRPC_URL, X_TOKEN, {
  //       "grpc.max_receive_message_length": 1024 * 1024 * 1024, // 64MiB
  //     });
  //     const stream = await client.subscribe();
  //     const startTime = Date.now();

  //     // Ping request object
  //     const pingRequest: SubscribeRequest = {
  //       ping: { id: 1 },
  //       accounts: {},
  //       accountsDataSlice: [],
  //       transactions: {},
  //       transactionsStatus: {},
  //       blocks: {},
  //       blocksMeta: {},
  //       entry: {},
  //       slots: {},
  //     };

  //     // Setup ping interval
  //     const pingInterval = setInterval(async () => {
  //       await new Promise<void>((resolve, reject) => {
  //         stream.write(pingRequest, (err: any) => {
  //           if (err === null || err === undefined) {
  //             resolve();
  //           } else {
  //             reject(err);
  //           }
  //         });
  //       });
  //     }, PING_INTERVAL_MS);

  //     // Handle stream data
  //     // stream.on("data", (data) => {
  //     //   const ts = Date.now();
  //     //   const elapsed = Math.floor((ts - startTime) / 1000);
  //     //   elapsedTime = formatElapsedTime(elapsed);

  //     //   if (data.filters[0] === "txReq") {
  //     //     const accKeysBytes =
  //     //       data.transaction.transaction.transaction.message.accountKeys;
  //     //     const accountKeys = accKeysBytes.map((key: any) => bs58.encode(key));
  //     //     const txSig = bs58.encode(data.transaction.transaction.signature);
  //     //     let matchingAccount = "";

  //     //     accountKeys.forEach((account: any) => {
  //     //       if (COPY_ACCOUNTS.includes(account)) {
  //     //         dataDetectedCount += 1;
  //     //         console.log(
  //     //           `\n${new Date(
  //     //             ts
  //     //           ).toUTCString()}: Matching account detected from gRPC connection!`
  //     //         );
  //     //         matchingAccount = account;
  //     //         console.log(
  //     //           `${new Date(ts).toUTCString()}: Account: ${matchingAccount}`
  //     //         );
  //     //         console.log(`${new Date(ts).toUTCString()}: Signature: ${txSig}`);
  //     //         console.log(
  //     //           `${new Date(
  //     //             ts
  //     //           ).toUTCString()}: gRPC stream active for: ${elapsedTime}`
  //     //         );
  //     //         console.log(
  //     //           `${new Date(
  //     //             ts
  //     //           ).toUTCString()}: gRPC data detected count: ${dataDetectedCount}\n`
  //     //         );
  //     //       }
  //     //     });
  //     //   } else if (data.pong) {
  //     //     console.log(
  //     //       `${new Date(ts).toUTCString()}: Processed ping response!`
  //     //     );
  //     //   }
  //     // });

  //     stream.on("data", (data) => {
  //       let ts = new Date();
  //       if (data) {
  //         if (data.transaction) {
  //           const tx = data.transaction;
  //           // Convert the entire transaction object
  //           const convertedTx = convertBuffers(tx);
  //           // If you want to see the entire converted transaction:
  //           console.log(
  //             `${ts.toUTCString()}: Received update: ${JSON.stringify(
  //               convertedTx
  //             )}\n\n`
  //           );
  //         } else {
  //           console.log(`${ts.toUTCString()}: Received update: ${data}\n\n`);
  //         }
  //         stream.end();
  //       } else if (data.pong) {
  //         console.log(`${ts.toUTCString()}: Processed ping response!`);
  //       }
  //     });

  //     // Handle stream error
  //     stream.on("error", (err: any) => {
  //       if (ERROR_LEVEL == "stack") {
  //         console.log(`gRPC Stream ERROR message: ${err.stack}`);
  //       } else {
  //         console.log(
  //           `gRPC Stream ERROR message: ${err.message.replace("\n", "")}`
  //         );
  //       }

  //       clearInterval(pingInterval);
  //       stream.removeAllListeners();
  //       if (dataDetectedCount > 0) {
  //         resolve({ time: elapsedTime, count: dataDetectedCount, err: true });
  //       } else {
  //         resolve({ time: "-1", count: -1, err: true });
  //       }
  //     });

  //     // // Initial account request
  //     // const accountRequest: SubscribeRequest = {
  //     //   slots: {},
  //     //   commitment: CommitmentLevel.CONFIRMED,
  //     //   accounts: {},
  //     //   accountsDataSlice: [],
  //     //   transactions: {
  //     //     txReq: {
  //     //       vote: undefined,
  //     //       failed: undefined,
  //     //       signature: undefined,
  //     //       accountInclude: COPY_ACCOUNTS,
  //     //       accountExclude: {},
  //     //       accountRequired: {},
  //     //     },
  //     //   },
  //     //   transactionsStatus: {},
  //     //   blocks: {},
  //     //   blocksMeta: {},
  //     //   entry: {},
  //     // };

  //     // // stream.write(accountRequest, (err: any) => {
  //     // //   if (err) {
  //     // //     throw err;
  //     // //   }
  //     // // });

  //     // new Promise<void>((resolve, reject) => {
  //     //   stream.write(accountRequest, (err: any) => {
  //     //     if (err === null || err === undefined) {
  //     //       resolve();
  //     //     } else {
  //     //       reject(err);
  //     //     }
  //     //   });
  //     // });

  //     // Example subscribe request.
  //     const request: SubscribeRequest = {
  //       commitment: CommitmentLevel.PROCESSED,
  //       accountsDataSlice: [],
  //       ping: undefined,
  //       transactions: {
  //         client: {
  //           vote: false,
  //           failed: false,
  //           accountInclude: ["675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"],
  //           accountExclude: [],
  //           accountRequired: [],
  //         },
  //       },
  //       // unused arguments
  //       accounts: {},
  //       slots: {},
  //       transactionsStatus: {},
  //       entry: {},
  //       blocks: {},
  //       blocksMeta: {},
  //     };

  //     // Send subscribe request
  //     await new Promise<void>((resolve, reject) => {
  //       stream.write(request, (err: any) => {
  //         if (err === null || err === undefined) {
  //           resolve();
  //         } else {
  //           reject(err);
  //         }
  //       });
  //     }).catch((reason) => {
  //       console.error(reason);
  //       throw reason;
  //     });

  //     // Handle ping interval write
  //     new Promise<void>((resolve, reject) => {
  //       stream.write(pingRequest, (err: any) => {
  //         if (err === null || err === undefined) {
  //           resolve();
  //         } else {
  //           reject(err);
  //         }
  //       });
  //     });

  //     setTimeout(() => {
  //       clearInterval(pingInterval);
  //       stream
  //         .removeAllListeners()
  //         .once("error", () => {
  //           resolve({
  //             time: elapsedTime,
  //             count: dataDetectedCount,
  //             err: false,
  //           });
  //         })
  //         .cancel();
  //       resolve({ time: elapsedTime, count: dataDetectedCount, err: false });
  //     }, TEST_DURATION * 1000);
  //   } catch (e: any) {
  //     if (ERROR_LEVEL == "stack") {
  //       console.log(`[TOP] gRPC Stream ERROR message: ${e.stack}`);
  //     } else {
  //       console.log(
  //         `[TOP] gRPC Stream ERROR message: ${e.message.replace("\n", "")}`
  //       );
  //     }

  //     if (dataDetectedCount > 0) {
  //       resolve({ time: elapsedTime, count: dataDetectedCount, err: true });
  //     } else {
  //       resolve({ time: "-1", count: -1, err: true });
  //     }
  //   }
  // });
}

async function testGrpcCalls() {
  const startTime = Date.now();
  let callsMade = 0;
  let elapsedTime = "0";

  const isServerUnderMaintenance = await checkServerMaintenance(GRPC_URL);
  if (isServerUnderMaintenance) {
    return { time: "-1", count: -1, err: true }; // If under maintenance, return early with error state
  }

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
          `\n${new Date(
            ts
          ).toUTCString()}: Latest blockhash received from gRPC call!`
        );
        console.log(
          `${new Date(ts).toUTCString()}: Latest blockhash from chain: ${
            latestBlockhash.blockhash
          }`
        );
        console.log(
          `${new Date(ts).toUTCString()}: gRPC calls active for: ${elapsedTime}`
        );
        console.log(
          `${new Date(ts).toUTCString()}: gRPC calls made: ${callsMade}\n`
        );
      } catch (error: any) {
        if (ERROR_LEVEL == "stack") {
          console.log(`gRPC Calls ERROR message: ${error.stack}`);
        } else {
          console.log(
            `gRPC Calls ERROR message: ${error.message.replace("\n", "")}`
          );
        }

        if (callsMade > 0) {
          return { time: elapsedTime, count: callsMade, err: true };
        } else {
          return { time: "-1", count: -1, err: true };
        }
      }
    }
  } catch (e: any) {
    if (ERROR_LEVEL == "stack") {
      console.log(`[TOP] gRPC Calls ERROR message: ${e.stack}`);
    } else {
      console.log(
        `[TOP] gRPC Calls ERROR message: ${e.message.replace("\n", "")}`
      );
    }
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
              `${new Date(
                ts
              ).toUTCString()}: Matching account detected from WEBSOCKET connection!`
            );
            console.log(
              `${new Date(ts).toUTCString()}: Account: ${COPY_ACCOUNTS[0]}`
            );
            console.log(`${new Date(ts).toUTCString()}: Signature: ${txSig}`);
            console.log(
              `${new Date(
                ts
              ).toUTCString()}: WebSocket stream active for: ${elapsedTime}`
            );
            console.log(
              `${new Date(
                ts
              ).toUTCString()}: WebSocket data detected count: ${dataDetectedCount}\n`
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
        if (ERROR_LEVEL == "stack") {
          console.log(`Websocket Stream ERROR message: ${error.stack}`);
        } else {
          console.log(
            `Websocket Stream ERROR message: ${error.message.replace("\n", "")}`
          );
        }
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
      if (ERROR_LEVEL == "stack") {
        console.log(`[TOP] Websocket Stream ERROR message: ${e.stack}`);
      } else {
        console.log(
          `[TOP] Websocket Stream ERROR message: ${e.message.replace("\n", "")}`
        );
      }

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

  const isServerUnderMaintenance = await checkServerMaintenance(HTTP_URL);
  if (isServerUnderMaintenance) {
    return { time: "-1", count: -1, err: true }; // If under maintenance, return early with error state
  }

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
          `\n${new Date(
            ts
          ).toUTCString()}: Signatures for first copy account received from HTTP call!`
        );
        console.log(
          `${new Date(ts).toUTCString()}: Account: ${COPY_ACCOUNTS[0]}`
        );
        console.log(
          `${new Date(
            ts
          ).toUTCString()}: Latest Signature from Account: ${latestAccountTx}`
        );
        console.log(
          `${new Date(ts).toUTCString()}: HTTP calls active for: ${elapsedTime}`
        );
        console.log(
          `${new Date(ts).toUTCString()}: HTTP calls made: ${callsMade}\n`
        );
      } catch (error: any) {
        if (ERROR_LEVEL == "stack") {
          console.log(`HTTP ERROR message: ${error.stack}`);
        } else {
          console.log(`HTTP ERROR message: ${error.message.replace("\n", "")}`);
        }
        if (callsMade > 0) {
          return { time: elapsedTime, count: callsMade, err: true };
        } else {
          return { time: "-1", count: -1, err: true };
        }
      }
    }
  } catch (e: any) {
    if (ERROR_LEVEL == "stack") {
      console.log(`[TOP] HTTP ERROR message: ${e.stack}`);
    } else {
      console.log(`[TOP] HTTP ERROR message: ${e.message.replace("\n", "")}`);
    }
    if (callsMade > 0) {
      return { time: elapsedTime, count: callsMade, err: true };
    } else {
      return { time: "-1", count: -1, err: true };
    }
  }
}

async function runTests() {
  const startTime = Date.now();
  const locations = await checkUrlsForLocation([GRPC_URL, HTTP_URL, WS_URL]);

  console.log();
  await logConfig(locations);

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
          ? chalk.hex("#FFA500")(`${gRpcStreamResults.count} - Error occurred`)
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

  await logConfig(locations);

  const endTime = Date.now();
  const elapsedTime = formatElapsedTime(
    Math.floor((endTime - startTime) / 1000)
  );
  console.log(chalk.bold(`Done in ${elapsedTime}`));
}

runTests();
