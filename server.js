// dependencies 
const express = require("express")
const path = require("path")
const crypto = require("crypto")
const getDB = require("./db")
const port = 8080; 
const app = express()


// json request bodies 
app.use(express.json())

// Serve static files
app.use(express.static(__dirname))
app.use("/assets", express.static(path.join(__dirname, "assets")));


// ensures user is authenticated before accessign specific page 
function isValidToken(token) {
    return typeof token === "string" && /^[0-9a-f]{64}$/.test(token)
}

async function requireToken(req, res, next) {
    const token = req.headers.authorization;

    if (!isValidToken(token)) {
        return res.status(401).json({error: "Missing token"})
    }

    const db = await getDB();
    const session = await db.collection("sessions").findOne({token: token})

    if (!session) {
        return res.status(401).json({error: "Invalid Session"})
    }

    // store userId in sessions for access 
    req.userId = session.userId
    next();
}

// retrieves users cart 
async function getOrCreate(db, userId) {
    const carts = db.collection("carts")

    let cart = await carts.findOne({userId})

    if (!cart) {
        await carts.insertOne({userId, items: []})
        cart = await carts.findOne({userId})
    }

    return cart 
}

app.get("/home", function(req, res) {
    res.sendFile(path.join(__dirname, "index.html"))
})

app.get("/login", function(req, res) {
    res.sendFile(path.join(__dirname, "login.html"))
})

// post for login (authenticates user and creates session token)
app.post("/login", async (req, res) => {
    const db = await getDB(); 
    const users = db.collection("users")

    const {username, email, password} = req.body;

    if (!username && !email) {
        return res.status(400).json({error: "Please provide username or email"})
    }

    if (typeof password !== "string" ||
        (username && typeof username !== "string") ||
        (email && typeof email !== "string")) {
        return res.status(401).json({error: "Invalid Login"})
    }

    const identifierQuery = username ? {username} : {email}
    const user = await users.findOne(identifierQuery)

    if (!user || user.password !== password) {
        return res.status(401).json({error: "Invalid Login"})
    }

    // generate secure token 
    const token = crypto.randomBytes(32).toString("hex")

    await db.collection("sessions").insertOne({
        token, userId: user._id, createdAt: new Date()
    })

    res.json({token})
})


// delete session token from db
app.get("/logout", async function(req, res) {
    const token = req.headers.authorization;

    if (isValidToken(token)) {
        const db = await getDB();
        await db.collection("sessions").deleteOne({token: token})
    }
    res.sendFile(path.join(__dirname, "logout.html"))
})

// creats new user 
app.post("/register", async function(req, res) {
    const db = await getDB(); 
    const users = db.collection("users")

    const {username, email, password} = req.body;

    if (!password || !username || !email) {
        return res.status(400).json({error: "All fields required"})
    }

    const exists = await users.findOne({$or: [{username}, {email}]})

    if (exists) {
        return res.status(400).json({ error: "User already exists" });
    }

    await users.insertOne({username, email, password})

    return res.json({success: true})
})

app.get("/register", function(req, res) {
    res.sendFile(path.join(__dirname, "register.html"))
})

app.get("/checkout", function(req, res) {
    res.sendFile(path.join(__dirname, "checkout.html"))
})

// computers final cost and order entry in db, clears the cart afterwards 
app.post("/api/checkout", requireToken, async function(req, res) {
    const db = await getDB()
    const carts = db.collection("carts")
    const orders = db.collection("orders")

    const cart = await carts.findOne({userId: req.userId})

    if (!cart || cart.items.length === 0) {
        return res.status(400).json({error: "Cart is empty"})
    }

    // frontend sends product prices or list to server

    const {pricing} = req.body
    if (!pricing) {
        return res.status(400).json({error: "Missing pricing information"})
    }

    // calc price 
    let total = 0; 
    for (let i = 0; i < cart.items.length; i++) {
        let item = cart.items[i]
        const price = pricing[item.productId]

        if (!price) {
            return res.status(400).json({error: `Missing price for product ${item.productId}`})
        }

        total += price * item.qty
    }

    // create order
    const order = {
        userId: req.userId,
        items: cart.items,
        total, 
        createdAt: new Date()
    }

    const result = await orders.insertOne(order)

    res.json({
        success: true, 
        orderId: result.insertedId, 
        total
    })
    // empty cart 
    await carts.updateOne(
        {userId: req.userId},
        {$set: {items:[]}}
    )
})

app.get("/cart", function(req, res) {
    res.sendFile(path.join(__dirname, "cart.html"))
})

// gets user's cart
app.get("/api/cart", requireToken, async function(req, res) {
    const db = await getDB()

    const cart = await getOrCreate(db, req.userId)

    res.json(cart)
})

// adds item(s) to cart 
app.post("/api/cart/add", requireToken, async function(req, res) {
    const db = await getDB()
    const carts = db.collection("carts")

    const {productId, qty} = req.body
    
    if (!productId || qty == null) {
        return res.status(400).json({error: "productId and qty required"})
    }

    const cart = await getOrCreate(db, req.userId)

    const existing = cart.items.find( i => i.productId == productId)

    if (existing && existing.qty <= 0) {
        return res.status(400).json({error: "qty must be > 0"});
    }

    if (existing) {
        existing.qty += qty
    } else {
        cart.items.push({productId, qty})
    }

    await carts.updateOne({userId: req.userId}, {$set: {items: cart.items}})

    res.json({success:true, cart})
})

// removes specific product from cart
app.post("/api/cart/remove", requireToken, async function(req, res) {
    const db = await getDB()
    const carts = db.collection("carts")

    const {productId} = req.body
    
    if (!productId) {
        return res.status(400).json({error: "productId required"})
    }

    const cart = await getOrCreate(db, req.userId)

    cart.items = cart.items.filter( i => i.productId !== productId)

    await carts.updateOne({userId: req.userId}, {$set: {items: cart.items}})

    res.json({success:true, cart})
})

// clears the cart 
app.post("/api/cart/clear", requireToken, async function(req, res) {
    const db = await getDB()
    const carts = db.collection("carts")

    await carts.updateOne(
        { userId: req.userId}, 
        {$set: {items:[]}}
    )
    
    res.json({success:true})
})

// returns profile info 
app.get("/api/profile", requireToken, async function(req, res) {
    const {ObjectId} = require("mongodb")
    const db = await getDB(); 
    const users = db.collection("users")

    console.log("req.userId type:", typeof req.userId, req.userId);

    const user = await users.findOne({_id:req.userId})
    if (!user) {
        return res.status(401).json({error: "User not found"})
    }

    res.json({
        username: user.username, 
        email: user.email
    })
    
})

app.get("/profile", function(req, res) {
    res.sendFile(path.join(__dirname, "profile.html"))
})


app.get("/products", function(req, res) {
    res.sendFile(path.join(__dirname, "products.html"))
})

//Imronbek's part

// populate products collection with some tech products so products page has data
async function seedProducts() {
    const db = await getDB()
    const products = db.collection("products")

    const count = await products.countDocuments()

    if (count === 0) {
        await products.insertMany([
            {
                name: "Gaming Laptop",
                category: "Laptops",
                price: 1299.99,
                description: "15 inch gaming laptop with dedicated graphics and 16GB RAM",
                img: "/assets/gaming_laptop.png"
            },
            {
                name: "Mechanical Keyboard",
                category: "Accessories",
                price: 119.99,
                description: "RGB mechanical keyboard with hot swap switches",
                img: "/assets/keyboard.png"
            },
            {
                name: "Wireless Mouse",
                category: "Accessories",
                price: 49.99,
                description: "Ergonomic wireless mouse with 2.4GHz receiver", 
                img: "/assets/mouse.png"
            },
            {
                name: "4K Monitor",
                category: "Monitors",
                price: 399.99,
                description: "27 inch 4K IPS monitor for work and gaming",
                img: "/assets/monitor.png"
            },
            {
                name: "Noise Cancelling Headphones",
                category: "Audio",
                price: 199.99,
                description: "Over ear headphones with active noise cancelling",
                img: "/assets/headphones.png"
            },
            {
                name: "External SSD 1TB",
                category: "Storage",
                price: 149.99,
                description: "USB C portable SSD drive with fast transfer speeds",
                img: "/assets/ssd.png"
            }
        ])

        console.log("Populated default products")
    }
}

seedProducts().catch(err => {
    console.error("Failed to populate products", err)
})

/**
 * Products api for products page and checkout
 * Returns list of all products from "products" collection
 */
app.get("/api/products", async function(req, res) {
    const db = await getDB()
    const products = await db.collection("products").find().toArray()

    res.json(products)
})

/**
 * Order history api
 * Returns all orders for logged in user (newest first).
 * Also attaches product name and price when possible.
 */
app.get("/api/orders", requireToken, async function(req, res) {
    const db = await getDB()
    const orders = db.collection("orders")
    const products = db.collection("products")
    const {ObjectId} = require("mongodb")

    const orderList = await orders
        .find({userId: req.userId})
        .sort({createdAt: -1})
        .toArray()

    // collect product ids from all orders
    const ids = []
    orderList.forEach(function(order) {
        if (!order.items) return
        order.items.forEach(function(item) {
            if (!item.productId) return
            try {
                ids.push(new ObjectId(item.productId))
            } catch (err) {
                // ignore invalid ids
            }
        })
    })

    const productMap = {}

    if (ids.length > 0) {
        const productDocs = await products.find({_id: {$in: ids}}).toArray()
        productDocs.forEach(function(p) {
            productMap[p._id.toString()] = {
                name: p.name,
                price: p.price,
                img: p.img
            }
        })
    }

    const result = orderList.map(function(order) {
        const items = (order.items || []).map(function(item) {
            const info = productMap[item.productId]
            if (info) {
                return {
                    productId: item.productId,
                    qty: item.qty,
                    name: info.name,
                    price: info.price,
                    img: info.img
                }
            }
            return item
        })

        return {
            _id: order._id,
            createdAt: order.createdAt,
            total: order.total,
            items: items
        }
    })

    res.json(result)
})

/**
 * Order history page
 * Front end html should be in orders.html
 * The page itself will call /api/orders using auth token
 */
app.get("/orders", function(req, res) {
    res.sendFile(path.join(__dirname, "orders.html"))
})

app.listen(port)