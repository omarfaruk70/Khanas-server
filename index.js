const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const port = process.env.PORT || 5000;
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(express.json());
app.use(cors());

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.f3vnw1n.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    const database = client.db("BistroBoss");
    const usersCollection = database.collection("users");
    const menus = database.collection("menus");
    const reviews = database.collection("reviews");
    const cartCollection = database.collection("cartCollection");

    // ----- jwt and admin related apis ---------------

    // create a jsonwebtoken for api security
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const jwtToken = jwt.sign(user, process.env.ACCESS_TOKEN, {
        expiresIn: "1d",
      });
      res.send({ AccessToken: jwtToken });
    });

    // MiddleWare for verifyJWT Token
    const verifyjwtToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Unauthorized Access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Unauthorized Access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    // verify admin middleware. it intercepts some routes(like private routes). if user role is not admin it will not access those routes
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const isAdmin = user?.role === "admin";
      if (!isAdmin) {
        return res.status(403).send({ message: "Unauthorized Access" });
      }
      next();
    };

    // check user is Admin or not (using email and adding role);
    app.get("/allusers/checkAdmin/:email", verifyjwtToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden" });
      }
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === "admin";
      }
      res.send({ admin });
    });

    // Make an admin api using patch method
    app.patch(
      "/allusers/makeAdmin/:id",
      verifyjwtToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await usersCollection.updateOne(query, updatedDoc);
        res.send(result);
      }
    );

    // get all data from database
    app.get("/menu", async (req, res) => {
      const menucollection = await menus.find().toArray();
      res.send(menucollection);
    });

    // get all review from database
    app.get("/reviews", async (req, res) => {
      const menucollection = await reviews.find().toArray();
      res.send(menucollection);
    });

    // get cart collection number for showing the cart/wishilist button
    app.get("/getallCard", async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    // get all  users in the admin dashboard
    app.get("/allusers", verifyjwtToken, verifyAdmin, async (req, res) => {
      // console.log(req.headers);
      const allusers = await usersCollection.find().toArray();
      res.send(allusers);
    });

    // get a specific item information for update item
    app.get("/menu/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menus.findOne(query);
      res.send(result);
    });
    // add item post for admin
    app.post("/menu", verifyjwtToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menus.insertOne(item);
      res.send(result);
    });
    // create a user and store in the database
    app.post("/users", async (req, res) => {
      const user = req.body;
      // insert email if user doesn't exist
      // we can do it many ways
      // 1. check the user email exist or not  2. upsert  3. Make email unique(mongoose)
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: "User already exist", insertedId: null });
      } else {
        const userInfo = await usersCollection.insertOne(user);
        res.send(userInfo);
      }
    });
    // post cart info
    app.post("/addToCard", async (req, res) => {
      const cartInfo = req.body;
      const result = await cartCollection.insertOne(cartInfo);
      res.send(result);
    });

    // update an item using patch(admin only)
    app.patch("/menu/:id", verifyjwtToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const Item = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          name: Item.name,
          recipe: Item.recipe,
          image: Item.image,
          category: Item.category,
          price: Item.price,
        },
      };
      const result = await menus.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // delete user from dashboard action
    app.delete(
      "/allusers/:id",
      verifyjwtToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await usersCollection.deleteOne(query);
        res.send(result);
      }
    );
    // delete a item from user dashboard (mycart route)
    app.delete(
      "/deleteitemfromMycart/:id",
      verifyjwtToken,
      async (req, res) => {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await cartCollection.deleteOne(query);
        res.send(result);
      }
    );
    // Delete an item from collection (admin only)
    app.delete("/menu/:id", verifyjwtToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menus.deleteOne(query);
      res.send(result);
    });

    // stripe payment intent
    app.post("/create-payment-intent",verifyjwtToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })
      res.send({
        clientSecret: paymentIntent.client_secret,
      })
    });
    
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Bistro boss server is Running!");
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
