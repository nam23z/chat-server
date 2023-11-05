const app = require("./app");

const mongoose = require("mongoose");

const dotenv = require("dotenv");
dotenv.config({ path: "./config.env" });

const { Server } = require("socket.io");

process.on("uncaughtException", (err) => {
  console.log(err);
  process.exit(1); // Exit code 1 indicates that a container shut down
});

const http = require("http");
const { error } = require("console");
const User = require("./models/user");

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

const DB = process.env.DBURI.replace("<PASSWORD>", process.env.DBPASSWORD);

mongoose
  .connect(DB)
  .then((con) => {
    console.log("DB connection is successfull");
  })
  .catch((error) => {
    console.log(error);
  });

const port = process.env.PORT || 8000;

server.listen(port, () => {
  console.log(`App running on port ${port}`);
});

io.on("connection", async (socket) => {
  const user_id = socket.handshake.query["user_id"];

  const socket_id = socket.id;

  console.log(`User connected ${socket_id}`);

  if (user_id) {
    await User.findByIdAndUpdate(user_id, { socket_id });
  }

  //can write our socket event listeners here...

  socket.on("friend_request", async (data) => {
    console.log(data.to);

    const to = await User.findById(data.to);
    //TODO => create a friend request
    io.to(to.socket_id).emit("new_friend_request", {});
  });
});

process.on("unhandledRejection", (err) => {
  console.log(err);
  server.close(() => {
    process.exit(1);
  });
});
