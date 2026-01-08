require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const app = express();
const port = process.env.PORT || 8800;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

app.use(
  cors({
    origin: ["http://localhost:5173", "https://crabby-square.surge.sh"], 
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// const verifyToken = (req, res, next) => {
//   const token = req.cookies?.token || req.headers.Authorization;
//   console.log(req);
//   if (!token) {
//     return res.status(401).send({ message: "unauthorized access" });
//   }
//   jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
//     if (err) {
//       return res.status(403).send({ message: "unauthorized access to" });
//     }
//     req.user = decoded;
//     next();
//   });
//   console.log("token inside the verifyToken", token);
// };

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.6aryg.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    const reviewCollection = db.collection("reviews");

    app.post("/users/:email", async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const query = { email };
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

    app.post("/review", async (req, res) => {
      const review = req.body;
      try {
        const result = await reviewCollection.insertOne(review);
        res.send({ success: true, result });
      } catch (error) {
        console.error(error);
        res
          .status(500)
          .send({ success: false, message: "Failed to submit review" });
      }
    });

    // app.post("/createPaymentIntent", async (req, res) => {
    //   try {
    //     const { parcelId } = req.body;

    //     if (!parcelId) {
    //       return res.status(400).json({ error: "Parcel ID is required" });
    //     }

    //     const parcel = await bookCollection.findOne({ parcelId });

    //     if (!parcel) {
    //       return res.status(404).json({ error: "Parcel not found" });
    //     }

    //     const price = parcel.price;

    //     if (!price || typeof price !== "number") {
    //       return res
    //         .status(400)
    //         .json({ error: "Invalid price for the parcel" });
    //     }

    //     const paymentIntent = await stripe.paymentIntents.create({
    //       amount: Math.round(price * 100),
    //       currency: "usd",
    //     });

    //     res.json({ clientSecret: paymentIntent.client_secret });
    //   } catch (error) {
    //     console.error("Error creating payment intent:", error);
    //     res.status(500).json({ error: "Failed to create payment intent" });
    //   }
    // });

    // app.post("/confirm-payment", async (rea, res) => {
    //   const { paymentIntentId, parcelId } = req.body;
    //   await Parcel.findByIdAndUpdate(parcelId, { status: "Paid" });
    //   res.send({ success: true });
    // });

    app.get("/review/:deliveryManId", async (req, res) => {
      const { deliveryManId } = req.params;
      try {
        const reviews = await reviewCollection
          .find({ deliveryManId })
          .toArray();
        if (reviews.length === 0) {
          return res
            .status(404)
            .json({ message: "No reviews found for this delivery man" });
        }
        res.json(reviews);
      } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to fetch reviews" });
      }
    });

    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get("/reviews", async (req, res) => {
      try {
        const result = await reviewCollection.find().limit(8).toArray(); 
        res.send(result)
      } catch (error) {
        console.error("Error fetching reviews:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    // const verifyAdmin = async (req, res, next) => {
    //   const email = req.user?.email;
    //   const query = { email };
    //   const result = await bookCollection.findOne(query);
    //   if (!result || result?.role !== "admin")
    //     return res
    //       .status(403)
    //       .send({ message: "Forbidden Access! Admin Only Actions!" });
    //   next();
    // };

    app.get("/userId/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res.status(404).send({ message: "User not found" });
        }
        const numericId = user._id.toString();
        res.send({ _id: numericId });
      } catch (error) {
        console.error("Error fetching user:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/users/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email: { $ne: email } };
        const users = await userCollection.find(query).toArray();

        const userStats = [];

        for (const user of users) {
          const userEmail = user.email;
          const userParcels = await bookCollection
            .find({ email: userEmail })
            .toArray();
          const totalSpent = userParcels.reduce(
            (acc, parcel) => acc + parcel.price,
            0
          );

          userStats.push({
            name: user.name,
            phone: user.phone, 
            parcelsDelivered: userParcels.length,
            totalSpentAmount: totalSpent,
            role: user.role,
            _id: user._id.toString(),
            email: user.email,
          });
        }

        res.send(userStats);
      } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/adminStat", async (req, res) => {
      const parcelBooked = await bookCollection.estimatedDocumentCount();
      const parcelDelivered = await bookCollection.countDocuments({
        status: "Delivered",
      });
      const TotalUser = await userCollection.estimatedDocumentCount();
      res.send({ parcelBooked, parcelDelivered, TotalUser });
    });

    app.get("/users/delivery/:role", async (req, res) => {
      try {
        const role = req.params.role;
        const query = { role };
        const users = await userCollection.find(query).toArray();
        const deliveryStats = [];
        for (const user of users) {
          const deliveryManId = user._id.toString();
          const parcelsDelivered = await bookCollection.countDocuments({
            deliveryManId,
            status: "Delivered",
          });
          const parcels = await bookCollection
            .find({ deliveryManId })
            .toArray();
          const reviews = await reviewCollection
            .find({ deliveryManId })
            .toArray();
          const totalReviews = reviews.reduce(
            (acc, review) => acc + (review.rating || 0),
            0
          );
          const averageReview = reviews.length
            ? (totalReviews / reviews.length).toFixed(2)
            : "No reviews";
          deliveryStats.push({
            name: user.name,
            phone: user.phone,
            parcelsDelivered,
            email: user.email,
            averageReview,
            _id: user._id.toString(),
          });
        }
        res.send(deliveryStats);
      } catch (error) {
        console.error("Error fetching delivery men:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.findOne({ email });
      res.send({ role: result?.role });
    });

    app.get("/user/id/:email", async (req, res) => {
      const email = req.params.email;
      const result = await userCollection.findOne({ email });
      res.send({ id: result?._id });
    });

    //update user role and status
    app.patch("/user/role/:email", async (req, res) => {
      const email = req.params.email;
      const { role } = req.body;
      const filter = { email };
      const updateDoc = {
        $set: { role, status: "Verified" },
      };
      try {
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.patch("/book/status/:id", async (req, res) => {
      const id = new ObjectId(req.params.id);
      const { status, deliveryManId, approximateDeliveryDate } = req.body;

      const filter = { _id: id };
      const updateDoc = {
        $set: {
          status,
          deliveryManId,
          approximateDeliveryDate: approximateDeliveryDate
            ? approximateDeliveryDate
            : new Date().toDateString(),
        },
      };
      const result = await bookCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.patch("/parcel/status/:id", async (req, res) => {
      const id = new ObjectId(req.params.id);
      const { status } = req.body;
      const filter = { _id: id };
      const updateDoc = { $set: { status } };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.get("/parcel/deliveryMan/:userId", async (req, res) => {
      const userId = req.params.userId;
      try {
        const result = await bookCollection
          .find({ deliveryManId: userId })
          .toArray();
        if (result.length > 0) {
          res.status(200).json({
            message: `Parcel for delivery man with ID: ${userId}`,
            data: result,
          });
        } else {
          res
            .status(404)
            .json({ message: "No parcels found for this delivery man" });
        }
      } catch (error) {
        console.error("Error fetching parcels", error);
        res.status(500).json({ message: "Internal Server Error" });
      }
    });

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

    app.get("/parcels", async (req, res) => {
      const { status, deliveryManId, fromDate, toDate } = req.query;
      const query = {};
      if (status) {
        query.status = status;
      }
      if (deliveryManId) {
        query.deliveryManId = deliveryManId;
      }
      if (fromDate && toDate) {
        query.approximateDeliveryDate = {
          $gte: new Date(fromDate).getTime(),
          $lte: new Date(toDate).getTime(),
        };
      }
      try {
        const result = await bookCollection.find(query).toArray();
        res.status(200).send(result);
      } catch (error) {
        console.error("Error fetching parcels:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    //update related issues
    app.get("/books/:email/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookCollection.findOne(query);
      res.send(result);
    });

    app.put("/books/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const options = { upsert: true };
      const updateBooks = req.body;
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
          longitude: updateBooks.longitude,
        },
      };
      const result = await bookCollection.updateOne(filter, books, options);
      res.send(result);
    });

    app.get("/topDeliveryMen", async (req, res) => {
      try {
        const users = await userCollection
          .find({ role: "deliveryMan" })
          .toArray();

        const deliveryStats = [];

        for (const user of users) {
          const deliveryManId = user._id.toString();

          const parcelsDelivered = await bookCollection.countDocuments({
            deliveryManId,
            status: "Delivered",
          });

          const reviews = await reviewCollection
            .find({ deliveryManId })
            .toArray();

          const totalReviews = reviews.reduce(
            (acc, review) => acc + (review.rating || 0),
            0
          );
          const averageReview = reviews.length
            ? (totalReviews / reviews.length).toFixed(2)
            : "No reviews";

          deliveryStats.push({
            name: user.name,
            phone: user.phone,
            parcelsDelivered,
            averageReview:
              averageReview === "No reviews" ? 0 : parseFloat(averageReview),
            image: user.image || "https://via.placeholder.com/150", // Default image
            _id: user._id.toString(),
          });
        }

        // Sort by parcels delivered (desc), then average rating (desc)
        const topDeliveryMen = deliveryStats
          .sort((a, b) =>
            b.parcelsDelivered !== a.parcelsDelivered
              ? b.parcelsDelivered - a.parcelsDelivered
              : b.averageReview - a.averageReview
          )
          .slice(0, 3); 
        res.send(topDeliveryMen);
      } catch (error) {
        console.error("Error fetching top delivery men:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.get("/adminStatistic", async (req, res) => {
      try {
        const bookingByDate = await bookCollection
          .aggregate([
            {
              $addFields: {
                date: { $toDate: "$date" },
              },
            },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .toArray();

        const bookVsDelivered = await bookCollection
          .aggregate([
            {
              $addFields: {
                date: { $toDate: "$date" },
              },
            },
            {
              $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                booked: { $sum: 1 },
                delivered: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "Delivered"] }, 1, 0],
                  },
                },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .toArray();

        res.json({ bookingByDate, bookVsDelivered });
      } catch (error) {
        console.error("Error fetching admin statistics:", error);
        res
          .status(500)
          .send({ message: "Internal Server Error", error: error.message });
      }
    });

    app.delete("/books/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await bookCollection.deleteOne(query);
      res.send(result);
    });

    // await client.connect();

    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
  } finally {
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Parcel is falling from sky");
});

app.listen(port, () => {
  console.log(`Parcel man is waiting for you at the port number: ${port}`);
});
