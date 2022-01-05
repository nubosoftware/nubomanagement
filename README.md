# The management component

It is part of the [Linux Remote Desktop](https://github.com/nubosoftware/linux-remote-desktop) system.

It is the main orchestrator that manages all the other components. It authneticates users and handles the lifecycle of the users' sesssions.

It connects to MySQL database to access persistent data (e.g. user credentials) and Redis data store to access non-persistent data (e.g. current loggged-in users).

It is based on node.js and is a stateless service, so you can have mutiple instances running for scalability and availability.
