const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const pgp = require("pg-promise")();

const { DATABASE_URL, DEV_DATABASE_URL, PORT, RPC_URL } = process.env;

const app = express();
const port = PORT || 5000;

const corsOptions = {
  origin: [
    "http://localhost:3000",
    "https://gum-comic-claim-client.herokuapp.com/",
  ],
};
app.use(cors(corsOptions));
app.use(bodyParser.json());

const prodDbOptions = {
  connectionString: DATABASE_URL,
  max: 20,
  ssl: {
    rejectUnauthorized: false,
  },
};
const db = pgp(DEV_DATABASE_URL || prodDbOptions);

app.get("/", (req, res) => {
  res.send("sup sup");
});

app.get("/accounts/:account/balances", async (req, res) => {
  const {
    params: { account },
  } = req;
  await db
    .any("select kid_count from kid_holders where account = $<account>", {
      account,
    })
    .then((_kidData = []) => {
      db.any("select pup_count from pup_holders where account = $<account>", {
        account,
      })
        .then((_pupData = []) => {
          const [kidData = {}] = _kidData;
          const { kid_count: kidCount } = kidData;
          const [pupData = {}] = _pupData;
          const { pup_count: pupCount } = pupData;
          res.send({ data: { kidCount, pupCount } });
        })
        .catch((pupError) => {
          res.status(500);
          res.send({ pupError });
        });
    })
    .catch((kidError) => {
      res.status(500);
      res.send({ kidError });
    });
});

app.listen(port, () => {
  console.log(`porting at port ${port}`);
});
