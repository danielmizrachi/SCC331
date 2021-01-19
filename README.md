# SCC331 Cloud server

This is the Node.js server I developed for one of two IoT group projects during the third year of my Software Engineering BSc. It was carried out January - March 2020 and the source code is unchanged since then. In order to showcase my work here I copied it from the original repo, initialised a new repo and pushed it here.

The original README continues below, however running the server will fail as the database server only accepts connections from one IP. This repo should be used for browsing the code only.

---

A Node.js server which:
- Maintains a local, calculated cache of the database for low-cost on-demand requests from clients
- Hosts a WebSocket server sending periodic data events to clients

## Running
`npm run build` will build the server.

`npm start` will run whatever is already built under `/dist`.
