require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const app = express();
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token || req.headers.Authorization;
  console.log(req);
  if (!token) {
    return res.status(401).send({ message: "unauthorized access" });
  }

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "unauthorized access to" });
    }
    req.user = decoded;
    next();
  });
  console.log("token inside the verifyToken", token);
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6aryg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    const db = client.db("parcelTime");
    const userCollection = db.collection("parcels");
    const bookCollection = db.collection("books");

    //save or update user in db
    app.post("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email };
      console.log(user);
      //check if user exits in db
      const isExist = await userCollection.findOne(query);
      if (isExist) {
        return res.send(isExist);
      }
      const result = await userCollection.insertOne({
        ...user,
        role: "customer",
        status: "null",
        timestamp: Date.now(),
      });
      res.send(result);
    });

    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //get all user data
    app.get("/users/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: { $ne: email } };
      console.log("Email to exclude:", email);
      console.log("Query used:", query);
      const result = await userCollection.find(query).toArray();
      res.send(result);
    });

   

    //all delivery man
    app.get("/users/:role", async (req, res) => {
      const role = req.params.role;
      const query = { role: role };
      const user = await userCollection.find(query).toArray();
      res.send(user);
    });

    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.findOne({ email });
      res.send({ role: result?.role });
    });

    //update user role and status
    app.patch('/user/role/:email', async(req, res) =>{
        const email = req.params.email
        const { role } = req.body
        const filter = { email }
        const updateDoc = {
            $set: { role, status: 'Verified'},
        }
        const result = await userCollection.updateOne(filter, updateDoc)
        res.send(result)
    })


    //auth related apis
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "12h",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV == "production" ? "none" : "strict",
        })
        .send({ success: true, token });
    });

    app.get("/logout", (req, res) => {
      res
        .clearCookie("token", {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV == "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    app.post("/books", async (req, res) => {
      const book = req.body;
      const result = await bookCollection.insertOne({
        ...book,
        status: "pending",
      });
      res.send(result);
    });

    app.get("/books/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await bookCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/books", async (req, res) => {
      const result = await bookCollection.find().toArray();
      res.send(result);
    });

    //update related issues
    app.get('/books/:email/:id', async(req, res) =>{
        const id = req.params.id
        const query = { _id: new ObjectId(id)}
        const result = await bookCollection.findOne(query)
        res.send(result)
    })

    app.put('/books/:id', async(req, res) =>{
      const id = req.params.id
      const filter = {_id: new ObjectId(id)}
      const options = {upsert: true}
      const updateBooks = req.body
      const books = {
        $set: {
          name: updateBooks.name,
          email: updateBooks.email,
          phone: updateBooks.phone,
          type: updateBooks.type,
          weight: updateBooks.weight,
          rename: updateBooks.rename,
          rePhone: updateBooks.rePhone,
          delivery: updateBooks.delivery,
          date: updateBooks.date,
          latitude: updateBooks.latitude,
          longitude: updateBooks.longitude
        } 
      }
      const result = await bookCollection.updateOne(filter, books, options)
      res.send(result)
    })

    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Parcel is falling from sky");
});

app.listen(port, () => {
  console.log(`Parcel man is waiting for you at: ${port}`);
});
