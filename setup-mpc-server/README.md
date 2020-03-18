# zkparty MPC Coordinator Guide
**All of this code is highly experimental and has not been audited. Use at your own risk.** [Hackmd link](https://hackmd.io/@bgu33/H1ndttIBL)

This set of tools allows you to run a trusted setup ceremony for zkSNARKs. We are using a fork of AZTEC's trusted setup repository.

Our coordinator server is an HTTP(S) server with a fairly straightforward API that allows clients to register, query for ceremony state, download the latest parameter file, and upload a (signed) parameter file when it is their turn to do so. The server also allows admins to perform various administrative functions (setting ceremony parameters, adding participants, etc.). The server also automatically verifies the integrity of contributions and exposes a history of all contributions for independent verification.

In this coordinator guide:
- **Ceremony lifecycle**: An overview of how ceremonies work with `setup-mpc-server`.
- **Get, build, and run a server**: How to build and run the trusted setup server code.
- **Quickstart**: Get up and running locally once you've built the repo.
- **Ceremony state guide**: The ceremony parameters (admin address, start time, end conditions, timeout conditions, more) and how to set and change them.
- **Ceremony data guide**: Where ceremony data is stored, and how to reload or discard data.
- **Selecting participants**: How to register and order participants in the ceremony.
- **API**: Description of the coordinator server API.
- **Setup binaries**: How to build and run the phase2 binaries used by the coordinator server on their own.

## Ceremony lifecycle
This section will summarize at a high level how conducting an MPC ceremony with `setup-mpc-server` works.

There are five parts:
- Committing to beacon entropy
- Registering, selecting, and ordering participants
- Collecting participant contributions
- Generating your final parameter set
- Allowing independent verification

In general, administrator actions are authorized by signing with the private key of an admin account associated with your instance of `setup-mpc-server`.

**Commit to beacon**. Before you begin your ceremony, you should publicly and verifiably commit to an unbiasable source of randomness - a beacon - whose entropy will be added into the parameter set at the very end of the ceremony. The output of the beacon should not occur until AFTER all contributions have been collected, so schedule appropriately. This procedure is out of the scope of `setup-mpc-server`; you can do this however you'd like.

**Select participants**. To begin your ceremony, you'll need to register, select, and order participants. You can whitelist participants through the "Reset ceremony state" and "Add participant" admin routes. Participants can also join the ceremony by sending 1 Wei to the ceremony's admin account; the ceremony will listen for these transactions. Participants are shuffled once a predetermined block number (that the admin decides on) is reached on the Ethereum network; their ordering is determined by entropy from that the hash of this "selection block." More details in the **Selecting Participants** section of this guide.

**Collect contributions**. Next, you'll need to collect and verify participant contributions. Once the selection block has been mined AND the admin-determined `startTime` has passed, `setup-mpc-server` will enter the `RUNNING` state. The server will automatically notify participating and online `setup-mpc-client`s one by one to ask them to prepare contributions, in the order determined during the selection phase. When a participant is notified that it is their turn to contribute, they must download the previous contribution, run the `contribute` binary to contribute their own entropy, and upload this contribution to the server. This happens automatically for participants running a vanilla `setup-mpc-client`; the client can also be run in a special "offline/secure" mode for security-conscious participants who want to carry the process out manually. On receiving an upload, the server will run a `verify_contribution` binary on the upload to determine that it is a validly-formed contribution. After verification, the server will then notify the next participant in line.

**Generate your final params**. Once `minParticipants` contributors have made valid contributions AND the `endTime` has been reached, `setup-mpc-server` shifts to the `COMPLETE` state. It is up to you, the ceremony coordinator, to take the ceremony's last contribution and add the entropy from a beacon to it to generate your final parameter set.

**Allow for verification**. The ceremony server saves all contributions and participant signatures on the contributions, and exposes this data via unpermissioned `GET` routes. Anyone may download the initial parameters, participant contributions, and signatures to verify that all contributions were done properly. **You should also publish your circuit.json file and post-beacon final parameter set** (i.e. to your project homepage or Github repository).

## Get, build, and run a server
First, clone the `Setup` repository:
```
git clone https://github.com/briangu33/Setup
```
Next, copy your `circuit.json` file into `setup-mpc-server/initial`, and your Phase1 radix file into `setup-mpc-server/initial/radix`:
```
cp path/to/circuit.json setup-mpc-server/initial
cp path/to/phase1radix2mNUM setup-mpc-server/initial/radix
```

Finally, build the server:
```
./build-server.sh
```
This command will:
- build the Rust binaries for generating initial parameters and verifying contributions
- generate initial params `initial_params` in `setup-mpc-server/initial`
- build and link util code from `setup-mpc-common`
- build `setup-mpc-server`

To run the server for the first time, simply run `yarn start`:
```
ADMIN_ADDRESS=0x1aA18F5b595d87CC2C66d7b93367d8beabE203bB yarn start
```
Optional environment variables:
- `PORT`: The server will by default run on port 80. This can be changed by passing in the `PORT` environment variable.
- `STORE_PATH`: The relative path to the directory where the latest MPC state and all parameter transcripts will be saved to and read fromm.
- `ADMIN_ADDRESS`: The Ethereum address designated as the admin address. Requests to admin routes must be signed with the private key of this address. The private key of this address allows for arbitrary mutation of state, so keep it private! The default value if this is ommitted is `0x1aA...` as shown above.
- `INFURA_API_KEY`: The server will use the blockhash of a predetermined Ethereum block to determine the order of participants. To get this hash, the server queries Infura. The default API key points to a free account, so if you're having problems getting block information swap in your own key.

## Quickstart
This section will help you run a server locally on your machine, and test the system end-to-end by running a participant client that connects to your server.

First, follow the instructions in **Get, build, and run a server**. Replace `ADMIN_ADDRESS` with the address of an Ethereum account you control (throwaway is ideal for testing purposes).

### Reset state
Once you have an instance of `setup-mpc-server` running locally, you'll want to set its state with the appropriate parameters. Using an HTTP request tool of your choice, send the following request:

**Request**: `POST http://localhost/api/reset`
**Request body**:
```
{
	"name": "test",
	"startTime": 10,
	"endTime": 60,
	"selectBlock": -1,
	"invalidateAfter": 3200,
	"maxTier2": 5,
	"minParticipants": 2,
	"participants0": [
		"0xd2C9D000cAC95F9020864036a5cD634d11C01324",
		"0xA5f146eCb90A624de0433530634566313758f924"
	]
}
```
**Headers**:
- `X-Signature`: The text `SignMeWithYourPrivateKey`, signed by the admin address. For the default address `0x1aA...` (which should NOT be used for a production run) this is `0x57d537ce2418c6e4ffcdf1452d90c35a44bbfdd1ba4356ea09ec1cd4a1bfb97c5e1967f784b51694585f726c205121f68ddddef7aec6316ccc3356dc5cd9ced61b`.

After this step, your server is exposing an HTTP interface to a ceremony with two participants and name `test`.

### Query for ceremony state
At any time, you can query for the MPC state object with the following request.

**Request**: `GET http://localhost/api/state`

The structure of the body of the response object is described in **Ceremony state guide**.

### Run a test client
Make sure you have built the `setup-mpc-client:latest` docker image (see [the participant guide](https://hackmd.io/AFqIQYGCQDmNCXNVmA54-Q) for details; basically you just need to run `./build-all.sh` in `Setup`).

Open another terminal and navigate to `Setup/setup-mpc-client`. Then run the following command: 
```
API_URL=http://<YOUR_IP_ADDR> PRIVATE_KEY=0x6ce7300c5f7c4f95fe0ee662c869bb869441c556e7ff3d28001c5a88d630fefe ./run-client.sh
```

The private key in the above is the private key to the first account listed in the above request body. It's also important that you insert your IP address into `API_URL`; `localhost` will not work because we are running the client in a docker container.

If you'd like to complete the ceremony, you can open another and run a second client, using the private key to the second account listed:
```
API_URL=http://<YOUR_IP_ADDR> PRIVATE_KEY=0x011c0bb688388493b528d86d334245ba6112ce2e29193279dcffd76013717501 ./run-client.sh
```

Leave the server and both clients open. You can watch as the ceremony progresses and eventually completes. Here is a screenshot of what the client interface should look like after the first client's contribution has been uploaded and verified, and while the second client is computing its contribution (on your interface participants 03 through 13 will be missing):
![](https://i.imgur.com/mc9tSNn.png)

## Ceremony state guide
As a coordinator, you'll want to query for, set, and update the ceremony state depending on the needs of your ceremony. The state of a ceremony looks like this:
```
export interface MpcState {
  name: string;
  adminAddress: string;
  sequence: number;
  startSequence: number;
  statusSequence: number;
  ceremonyState: 'PRESELECTION' | 'SELECTED' | 'RUNNING' | 'COMPLETE';
  paused: boolean;
  maxTier2: number;
  minParticipants: number;
  invalidateAfter: number;
  startTime: Moment;
  endTime: Moment;
  network: "mainnet" | "ropsten";
  latestBlock: number;
  selectBlock: number;
  completedAt?: Moment;
  participants: Participant[];
}
```
A brief description of fields:
- `name`: An identifier for the ceremony. By default persisted data and state will be stored in `setup-mpc-server/store/[name]`. If you want to run multiple ceremonies while persisting data for all of them for whatever reason, give them different names.
- `adminAddress`: The admin of the ceremony. With the private key of this address, you can make arbitrary mutations to the state (add participants, pause the ceremony, reset or update ceremony state, etc.)
- `sequence`, `startSequence`, `statusSequence`: When the `setup-mpc-client` queries the coordinator server for state updates, it uses these fields to determine what diffs to ask for.
- `ceremonyState`
    - `PRESELECTION` means the ceremony has not yet started, and participants have not yet been selected (more on the selection process later).
    - `SELECTED` means participants have been selected but the ceremony has not yet started.
    - `RUNNING` means that the ceremony is running - participants are actively making contributions to the parameter set.
    - `COMPLETED` means the ceremony is finished; the ceremony is complete once `minParticipants` valid contributions have been recorded AND the current timestamp is past `endTime`.
- `paused`: Whether the ceremony is paused.
- `maxTier2`: Tier 2 participants are non-whitelisted participants who join through the open registration process (more on participant selection below). This is the maximum number of tier 2 participants allowed.
- `minParticipants`: The minimum number of valid contributions necessary for the ceremony to be considered complete. 
- `invalidateAfter`: If it's participant P's turn, P has `invalidateAfter` seconds to upload a valid contribution before P is timed out and skipped. Set this to be higher for MPCs for bigger circuits. In general this shouldn't be lower than a few minutes (the amount of time it would take for participants who are manually contributing to download, compute, and uploade).
- `startTime`: The ceremony start time, when the first participant is notified to make a contribution.
- `endTime`: The ceremony is complete once BOTH `endTime` has been reached and `minParticipant` valid contributions have been recorded.
- `network`: Participants are selected and ordered pseudorandomly, using the blockhash of the block at a predetermined height. Also, participants register through the open registration process by sending a transaction to the `adminAddress`. `network` determines whether we're listening to `mainnet` or `ropsten` for these functions.
- `selectBlock`: The block whose hash will be used to select and order participants.
- `completedAt`: The time at which the ceremony completed.
- `participants`: An array of `Participant` metadata. Participant fields are described below.

**Participant metadata**. Participant objects look like this:
```
export interface Participant {
  // Server controlled data.
  sequence: number;
  address: Address;
  state: 'WAITING' | 'RUNNING' | 'COMPLETE' | 'INVALIDATED';;
  position: number;
  priority: number;
  tier: number;
  verifyProgress: number;
  lastVerified?: Moment;
  addedAt: Moment;
  startedAt?: Moment;
  completedAt?: Moment;
  error?: string;
  online: boolean;
  lastUpdate?: Moment;
  invalidateAfter?: number;

  // Client controlled data.
  runningState: 'OFFLINE' | 'WAITING' | 'RUNNING' | 'COMPLETE';
  transcripts: Transcript[]; // Except 'complete'.
  computeProgress: number;
}
```
A brief description of fields:
- `sequence`: Sequence number of the last update to this participant's state. Used by clients to determine what diffs to ask the server for on state update.
- `address`: The Ethereum address associated with this participant. Any permissioned requests (i.e. upload contribution from participant `0x...`) must be signed with the private key of this account. 
- `state`
    - `WAITING` indicates participant has not yet contributed, and it is not their turn yet.
    - `RUNNING` indicates it is the participants turn currently. It is assumed that they are in the process of download parameters, computing the contribution, uploading their contribution, or getting their contribution verified by the server.
    - `COMPLETE` indicates participant has submitted a contribution that was verified by server.
    - `INVALIDATED` indicates participant submitted a bad contribution that server caught, or else timed out (failed to provide a valid contribution within the timeout period).
- `position`: The participant's current position in the queue. Can change during a ceremony due to offline/online changes (online participants always are put ahead of offline participants; if someone with higher `priority` comes online, lower priority participants will be shifted by 1 in `position`).
- `priority`: A random number assigned at selection. Used (along with tier and online/offline status) to determine `position` at any given time. Higher priority online participants are selected earlier to contribute.
- `tier`: The ceremony coordinator may assign participants different tiers: 0, 1, 2, and 3. Higher tier participants are given the opportunity to participate first. Refer to the "Selecting Participant" section for detailed rules.
- `verifyProgress`: **Not yet implemented; currently this is always either 0 or 100**.
- `lastVerified`: **Not yet implemented.** Will be relevant in the future when computation and verification are broken up per participant.
- `addedAt`: The time the participant was added to the ceremony.
- `startedAt`: The timestamp that the participant's turn started.
- `completedAt`: The timestamp the participant's contribution finished verifying.
- `error`: If the participant was `INVALIDATED`, the reason (i.e. "verify failed" or "timed out")
- `online`: Whether the participant has pinged the server in the last 10 seconds. A running `setup-mpc-client` will automatically ping the server every few seconds.
- `invalidateAfter`: The participant can have a timeout period that is different from the default timeout period specified in the ceremony state's `invalidateAfter` value. Admin can update this for specific participants.
- `runningState`
    - `OFFLINE` if its currently the participant's turn and they are running the client in offline/manual mode. This is different from the participant having `online` equal to false. In particular, a participant running the computation in offline mode will have `online` equal to true, and `runningState` equal to `OFFLINE`.
    - `WAITING` if its not yet the participants turn.
    - `RUNNING` if its the participants turn and they are not computing in offline mode.
    - `COMPLETE` if the participant has finished uploading their contribution.
- `transcripts`: An array of 0 or 1 Transcript metadata objects - 0 if the participant has completed their contribution or is waiting, 1 if its the participants turn. A transcript object tracks the upload, compute, and download progress of the participant's contribution.
- `computeProgress`: If it's the participant's turn, the percent of their computation they've performed. Either 0 or 100 for a participant running in offline mode.

## Ceremony data guide
Persisted ceremony data by default is saved in in `setup-mpc-server/store`. Verified transcripts can be found in `store/[ceremony name, ex: default]/verified`. Within this directory, each completed participant's contribution file and signature are stored in `[participant address]/transcript0.dat` and `[participant address]/transcript0.sig`.

The running MPC state is constantly being saved to `store/state/state.json`.This ensures that the server can be restarted at any point, and the latest state of the currently running ceremony will be loaded. If you reset state with the `POST /api/reset` route, the old ceremony state will be saved into `store/state/state_[old name].json`, and the state of the new ceremony you've uploaded with `/api/reset` will overwrite `state.json`.

Here is an example directory structure of `store` for a ceremony which is in progress.
```
store
    default
        unverified
        verified
    new_ceremony
        unverified
        verified
    new_ceremony2
        unverified
            0xd2C9D000cAC95F9020864036a5cD634d11C01324
                transcript0.dat
                transcript0.sig
        verified
            0xA5f146eCb90A624de0433530634566313758f924
                transcript0.dat
                transcript0.sig
            0xBd38EF2e1B28B1E9DE4e9F4Dcb73E53F2ad23a42
                transcript0.dat
                transcript0.sig
    state
        state_default.json
        state_new_ceremony.json
        state.json
```
A `default` ceremony is instantiated on the first run of the coordinator server. We can infer that the following actions occurred afterwards:
- Ceremony admin reset state with a new ceremony, with name `new_ceremony`. This caused the `default` ceremony state to get saved into `state_default.json`, created a new directory `store/new_ceremony`, and overwrote `state.json` with the initial state of `new_ceremony`.
- Ceremony admin reset state again with a new ceremony, `new_ceremony2`. This caused the `new_ceremony` state to get saved into `state_new_ceremony.json`, and overwrote `state.json` with the initial state of `new_ceremony2`.
- Two participants contributed to the ceremony `new_ceremony2` and had their contributions and signatures verified.
- One participant recently contributed to `new_ceremony2`, and their contribution is in the process of being verified by the server.

Note that if `0xd2C9...`'s transcript verifies properly, his data and signature files will be moved to `new_ceremonmy2/verified`. If verification fails, they will be deleted and the ceremony will mark him as `INVALIDATED` (unless he is participating in offline mode).

## Selecting Participants
Participants are identified as an Ethereum address. Participants must sign parameter contributions with their Eth address private key for the contributions to be accepted. `setup-mpc-server` gives coordinators tools to decide who can participate in ceremonies, and in what order.

Participants can be added in two ways:
- You can whitelist participants manually with HTTP requests to the server like like `POST /api/reset` and `PUT /api/participant/<address>`. 
- Participants can join by sending 1 Wei to the admin address. The server listens for any transactions sent to the admin address on the Ethereum network and automatically adds participants when it detects a transaction.

Participants have a `tier` number that is either 0, 1, 2, or 3. With `POST /api/reset` you can add Tier 0, Tier 1, and Tier 2 participants (though some Tier 2 participants may eventually get shuffled into Tier 3, if more than `maxTier2` participants eventually join). Participants added through `PUT /api/participant/<address>` can be added at any Tier; the default is Tier 2.
- **Tier 0**: These participants are guaranteed to be included in the ceremony, with priority in the order they are added, and at the very front of the queue.
- **Tier 1**: These participants are guaranteed to be included in the ceremony, in some shuffled order (shuffled with randomly selected Tier 2 participants). So they are guaranteed to participate as long as they come online, but with no guarantees on ordering.
- **Tier 2**: A random subset of `maxTier2` participants from this tier are selected at the selection block time and shuffled with the Tier 1 participants; these selected participants are guaranteed inclusion in the ceremony as long as they come online, but with unknown order. Remaining participants may or may not be included in the ceremony; if additional participants are needed, these participants (and Tier 3 participants) are included on a first-come-first-serve basis.
- **Tier 3**: These participants are not guaranteed to be included in the ceremony. If additional participants are needed beyond the Tier 0, Tier 1, and selected Tier 2 participants, these participants (along with unselected Tier 2 participants) are included on a first-come-first-serve basis.

Once one participant finishes their contribution, the server will pick the next participant to contribute based on, in order, (1) Liveness, i.e. it will only select from "online" participants, (2) Tier (in order of 0, then 1-or-2, then 3), (3) Priority, which is assigned randomly once the selection block has been mined (see **Ceremony state guide** for a description of the role of the selection block).

## API
A description of the coordinator HTTP server API.

### Admin routes
Routes for ceremony admin to manage the ceremony.

#### Reset ceremony: POST /api/reset
Resets the ceremony state.

**Request body**
```
{
    "name": "test", // name of ceremony
    "startTime": 10, // seconds from now until ceremony start timestamp
    "endTime": 60, // seconds from now until ceremony end timestamp
    "network": "mainnet", // network to listen to for block hashes and 1 Wei registration txs
    "selectBlock": 9691683, // block number whose hash will be used as seed for participant order shuffling. if negative, used as offset from latest block
    "maxTier2": 5, // maximum number of Tier 2 participants
    "minParticipants": 2, // minimum number of valid contributions for ceremony to be considered complete
    "invalidateAfter": 3200, // timeout length once participant is selected
    "participants0": [ // tier 0 participants. leave empty if none
        "0xd2C9D000cAC95F9020864036a5cD634d11C01324",
        "0xA5f146eCb90A624de0433530634566313758f924"
	],
    "participants1": [], // tier 1 participants. leave empty if none
    "participants2": [] // tier 2 participants. leave empty if none
}
```
**Headers**
- `X-Signature`: The text `SignMeWithYourPrivateKey`, signed by the admin address. For the default address `0x1aA...` (which should NOT be used for a production run) this is `0x57d537ce2418c6e4ffcdf1452d90c35a44bbfdd1ba4356ea09ec1cd4a1bfb97c5e1967f784b51694585f726c205121f68ddddef7aec6316ccc3356dc5cd9ced61b`.

**Returns** OK.

#### Update ceremony state: PATCH /api/state
Allows admin to update individual ceremony properties while a ceremony is running, without resetting the entire ceremony. Only certain fields can be updated. `maxTier2` and `selectBlock` cannot be updated after selection has occurred. `startTime` cannot be updated after the first participant has started computing their contribution. Starting at these times, those fields will be ignored.

**Request body**
A JSON object with any of `paused`, `startTime`, `endTime`, `selectBlock`, `maxTier2`, `minParticipants`, and `invalidateAfter` as fields. For example:
```
{
    "minParticipants": 10 // updates minParticipants to 10
}
```

**Headers**
- `X-Signature`: The text `SignMeWithYourPrivateKey`, signed by the admin address.

**Returns** ceremony state object, whose structure is described above.

#### Add participant: PUT /api/participant/:address
Add a participant. By default adds the participant as tier level 2, but a tier (either 0, 1, 2, or 3) can be passed in with query param `tier`. Participant is given last priority of all participants.

**Query Params**
- Tier: the tier to add the participant as. If omitted, defaults to 2.

**Headers**
- `X-Signature`: The text `SignMeWithYourPrivateKey`, signed by the admin address.

#### Update participant: PATCH /api/participant/:address
Updates a participant. The admin can update `state` and `invalidateAfter`. You may want to update `state` to `WAITING` for a participant if they were `INVALIDATED` and you want to give them another chance. You may want to update `invalidateAfter` for a participant if you want to increase their timeout period (for example, if they are computing offline and are using some extra security measures that need more time).

Note: This route (with participant rather than admin signature) is also used by running `setup-mpc-client`s to update the progress of their computation, but you should never need to use that functionality manually.

**Request body**
A JSON object with any of `invalidateAfter` and `state`. Example:
```
{
    "state": "WAITING",
    "invalidateAfter": 7200
}
```

**Headers**
- `X-Signature`: The text `SignMeWithYourPrivateKey`, signed by the admin address.

**Returns** OK.

#### Delete waiting participants: POST /api/flush-waiting
Deletes all `WAITING` participants. (Suggested use: cleanup at the end of your ceremony?)

**Request body**
(none)

**Headers**
- `X-Signature`: The text `SignMeWithYourPrivateKey`, signed by the admin address.

**Returns** OK.

#### Load another ceremony: GET /api/state/load/:name
If another ceremony named `name` exists in the `store`, loads this ceremony (and its accompanying data) into the server state in place of the current ceremony.

**Returns** Nothing.

### Participant routes
Routes for participants to signal liveness to the server or upload data.

#### Ping online: GET /api/ping/:address
Pings the server to indicate that participant identified by `address` is online and available for the next contribution turn. Participants are marked offline if they have not pinged the server in the last 10 seconds.

**Headers**
- `X-Signature`: The word `ping`, signed by the participant address private key.

#### Upload contribution: PUT /api/data/:address/0
Used for participants to upload their contribution. A utility for hitting this route is written in `setup-mpc-client-bash/upload/index.js`.

**Request body**
The contribution file.

**Headers**
- `X-Signature`: Two signatures, comma delimited. The first is the word `ping`, signed by the participant address. The second is the SHA256 sum of the transcript file, signed by the participant address.

### Public/verification routes
Anyone can make these calls. Third parties may be interested in checking on the ceremony state, or in downloading contributions and signatures for verification purposes.

#### GET /api/
**Returns** OK.

#### Get state: GET /api/state
**Returns** a ceremony state object, described above in **Ceremony state guide**.

#### Get state summary: GET /api/state-summary
**Returns** an abbreviated ceremony state object, containing two numeric fields `numParticipants` and `ceremonyProgress` (percentage from 0 to 100) in place of the full `participants` array.

#### Get initial parameters: GET /api/data/initial_params
**Returns** the initial parameter file generated by the trusted setup coordinator. This can be generated (and thus verified) by anyone with the `phase2` `new` binary and the `circuit.json` file, which the ceremony coordinator should publish publically.

#### Get contribution: GET /api/data/:address/0
**Returns** the contributed parameter file of the participant identified by `address`. `0` is included at the end for the same reason as above.

#### Get contribution signature: GET /api/signature/:address/0
**Returns** the signature of participant identified by `address` on their contribution. Remember to include the `0` at the end (it's there for a future extension that is not yet implemented).

## Setup binaries
We are using a very lightly modified version of Kobi Gurkan's [phase2 binaries](https://github.com/kobigurk/phase2-bn254/tree/master/phase2), which are themselves forked from ZCash's phase2 binaries. The source code for these binaries can be found in `setup-tools/phase2-bn254/phase2/src/bin`.

To compile these binaries, starting from `Setup`, run the following:
```
cd setup-tools/phase2-bn254/phase2
cargo build --release --bin contribute
cargo build --release --bin new
cargo build --release --bin verify_contribution
```
This will output compiled binaries into `phase2/target/release`.

Also included in the `phase2` directory is source code for `beacon`, `export_keys`, and `mimc`. `setup-mpc-server` does not use the binaries from these, but as a ceremony coordinator you may find them useful. Below is a description of what each binary does.

#### new
**Usage**: `new <in_circuit.json> <out_params.params> <path/to/phase1radix>`

Deterministically generates an (insecure) set of SNARK params for `in_circuit.json`. Requres you to have a `phase1radix` file of appropriate size.

#### contribute
**Usage**: `contribute <in_params.params> <in_str_entropy> <out_params.params>`

Adds entropy to a given parameter set `in_params.params` to produce `out_params.params`. Uses both OS entropy as well as user-provided `in_str_entropy`. You may optionally pass in an integer N (ex: `1000`) as a fourth command-line argument to have the program print a progress update to stdout every N parameter points computed.

#### verify_contribution
**Usage**: `verify_contribution <in_circuit.json> <in_old_params.params> <in_new_params.params> <path/to/phase1radix>`

Verifies the validity of a contribution that outputed `in_new_params.params` on input `in_old_params.params`.

#### export_keys
**Usage**: `export_keys in_params.params> <out_vk.json> <out_pk.json>`

Outputs SNARK verifier and prover keys given a set of parameters.

#### beacon
Adds entropy into a parameter set from a random beacon.

#### mimc
Example usage of the relevant Rust functions.
