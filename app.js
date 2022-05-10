const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const pgp = require("pg-promise")();
const nodemailer = require("nodemailer");

const {
  DATABASE_URL,
  EMAIL_HOST,
  EMAIL_PASSWORD,
  EMAIL_USERNAME,
  DEV_DATABASE_URL,
  PORT,
  RECIPIENT_EMAIL,
  RPC_URL,
} = process.env;

const app = express();
const port = PORT || 5000;

const corsOptions = {
  origin: [
    "http://localhost:3000",
    "https://gum-comic-claim-client.herokuapp.com",
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

app.get("/orders/:account", async (req, res) => {
  const {
    params: { account },
  } = req;
  await db
    .any("select * from orders where account = $<account>", {
      account,
    })
    .then((_orderData = []) => {
      const orderData = _orderData.map((order) => {
        const {
          id,
          account,
          delivery_address: deliveryAddress,
          count,
          notes,
          date_created: dateCreated,
        } = order;
        return { id, account, deliveryAddress, count, notes, dateCreated };
      });
      res.send({
        data: orderData,
      });
    })
    .catch((orderError) => {
      res.status(500);
      res.send({ orderError });
    });
});

app.post("/orders", async (req, res) => {
  const {
    body: { account, deliveryAddress, count, notes },
  } = req;
  await db
    .any("select sum(count) from orders where account = $<account>", {
      account,
    })
    .then(async (_existingOrderData = []) => {
      const [_sum = {}] = _existingOrderData;
      const { sum } = _sum;
      const existingOrderCount = parseInt(sum) || 0;
      await db
        .any("select kid_count from kid_holders where account = $<account>", {
          account,
        })
        .then(async (_kidData = []) => {
          await db
            .any(
              "select pup_count from pup_holders where account = $<account>",
              {
                account,
              }
            )
            .then(async (_pupData = []) => {
              const [kidData = {}] = _kidData;
              const { kid_count: kidCount = 0 } = kidData;
              const [pupData = {}] = _pupData;
              const { pup_count: pupCount = 0 } = pupData;
              const eligibleCount = Math.min(kidCount, pupCount);
              if (count + existingOrderCount > eligibleCount) {
                res.status(401);
                res.send({
                  orderError:
                    "Sorry, you're not eligible to order that many comics.",
                });
                return;
              }
              await db
                .any(
                  "insert into orders(account, delivery_address, count, notes) VALUES($<account>, $<deliveryAddress>, $<count>, $<notes>) returning *",
                  {
                    account,
                    deliveryAddress,
                    count,
                    notes,
                  }
                )
                .then(async (data) => {
                  res.send({ data });
                  try {
                    const transporter = nodemailer.createTransport({
                      host: EMAIL_HOST,
                      port: 587,
                      secure: true,
                      name: EMAIL_HOST,
                      auth: {
                        user: EMAIL_USERNAME,
                        pass: EMAIL_PASSWORD,
                      },
                      sendmail: true,
                      tls: {
                        rejectUnauthorized: false,
                      },
                    });
                    const emailRes = await transporter.sendMail({
                      from: `"BGK Comic Orders" <${EMAIL_USERNAME}>`,
                      to: RECIPIENT_EMAIL,
                      subject: "New BGK Comic Order",
                      text: `ACCOUNT:\n${account}\n\nDELIVERY ADDRESS:\n${deliveryAddress}\n\nCOUNT:\n${count}\n\nNOTES:\n${notes}`,
                    });
                  } catch (emailErr) {
                    console.error({ emailErr });
                  }
                })
                .catch((createOrderError) => {
                  res.status(500);
                  res.send({ createOrderError });
                });
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
    })
    .catch((existingOrderCountError) => {
      res.status(500);
      res.send({ existingOrderCountError });
    });
});

app.listen(port, () => {
  console.log(`porting at port ${port}`);
});
