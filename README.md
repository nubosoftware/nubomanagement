# The Management Component
## Main Orchestrator

It is part of the [Linux Remote Desktop](https://github.com/nubosoftware/linux-remote-desktop) system.

The main orchestrator that manages all the other components. It authneticates users and handles the lifecycle of the users' sesssions.

Connects to MySQL database to access persistent data (e.g. user credentials) and Redis data store to access non-persistent data (e.g. current loggged-in users).

Based on node.js and is a stateless service, so you can have mutiple instances running for scalability and availability.

### Building Instructions
```
git clone git@github.com:nubosoftware/nubomanagement.git
mkdir -p debs/latest
cd nubomanagement
./scripts/attachDesktopModule.sh
make docker
```
