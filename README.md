# CSC337 Final Project Name 

This is a Node.js web application built using Express and MongoDB. This application provides user authentication, a product catalog, a shoppoing cart, checkout, processing, and order history. 

Follow these steps below to install dependencies and run the project 

NOTE: All images should be places in a folder named assets. 

1. Install requireed packages:
    - npm install express
    - npm install mongodb
    - npm install crypto
    - npm install path 

2. Make sure MongoDB is running on your machine

3. Reset database and populate default products:
    - node resetDB.js

4. Start server: 
    - node server.js

This application will run at http://localhost:8080

Project Features: 
- User registration and login user token-based authentication
- Product listing pulled from MongoDB
- Image-backed product cards served from teh assets/directory
- Shopping cart stored by user ID
- Checkout system that calculates pricing and stores orders
- Order history page with product details and images
- Profile page showing current user information 
- Fully styled responsive UI with sidebar navigation and animated components



