require('dotenv').config()

const express = require('express')
const path = require('path')
const bcrypt = require('bcrypt')
const mysql2 = require('mysql2')
const jwt = require('jsonwebtoken')
const session = require('express-session');
const { access } = require('fs');
const app = express()

const patientRoute = require('./routes/patients')
const doctorRoute = require('./routes/doctors')
const pharmacyRoute = require('./routes/pharmacy')
const companyRoute = require('./routes/company')
const drugRoute = require('./routes/drugs')
app.use('/patients', patientRoute)
app.use('/doctors', doctorRoute)
app.use('/pharmacy', pharmacyRoute)
app.use('/company', companyRoute)
app.use('/drugs', drugRoute)

const users = []
let refreshTokens = []

app.use(express.static(path.join(__dirname, 'public'))) // Acess the right folder
app.use(express.json()) // Alloww express to send json

// Use express-session middleware
app.use(session({
    secret: 'c75ue5wsh8syozant1to5', // Change this to a strong, secure secret key
    resave: false,
    saveUninitialized: true,
}));

const connection = mysql2.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'dailypharma2',
});

connection.connect((err) => {
    if (err) {
        console.error('Error connecting to the database: ' + err.stack);
        return;
    }
    console.log('Connected to the database');
});

app.listen(3000 , ()=>{
    console.log("API up and running")
})

app.post('/register', (req,res)=>{
    //Retrieve the data from the body req
    const userType = req.body.userType
    const SSN = req.body.SSN
    const password = req.body.password
    
    //Test recieval
    console.log(req.body)

    if (req.body == null || req.body.SSN ==null || req.body.userType == null || req.body.password ==null ) {
        return res.status(500).json({ message: 'Please fill in all the fields' });
    }

    const sql = 'SELECT `ID/SSN`, User_Type, Password FROM api_access WHERE `ID/SSN` = ? AND `User_Type` = ?'
    connection.query(sql, [SSN, userType], (err,results)=>{
        if (err) return res.status(500).json( {error : "Internal Server Error" + err.stack})
        if (results.length > 0) {console.log("User already exists");return res.status(401).json({ message: 'User already exists' })}

        //Insert user 
        const insertSql = 'INSERT INTO `api_access`(`ID/SSN`, `User_Type`, `Password`) VALUES (?, ?, ?)'
        connection.query(insertSql, [SSN, userType, password], (err,complete)=>{
            //Results
            if (err) return res.status(500).json( {message : "Internal Server Error. Not Registered"})
            console.log(results);

            // window.alert("Registration successful. Proceed to login")
            // console.log({ message: 'Registration successful' });
            return res.status(200).json({ message: 'Registration successful. Proceed to login page.' });
        })  
    })
})

app.post('/login', (req, res) => {
    const userType = req.body.userType;
    const SSN = req.body.SSN;
    const password = req.body.password;
  
    console.log(req.body);

    if (req.body == null || req.body.SSN ==null || req.body.userType == null || req.body.password ==null ) {
        return res.status(500).json({ message: 'Please fill in all the fields' });
    }
  
    const sql = 'SELECT `ID/SSN`, `User_type`, `Drugs`, `Patients`, `Doctors`, `Pharmacies`, `Company`, `Password`, `Login_Time` FROM `api_access`  WHERE `ID/SSN` = ? AND User_Type = ?';
    connection.query(sql, [SSN, userType], (err, results) => {
      if (err) {
        return res.status(500).json({ message: 'Internal Server Error' + err.stack });
      }
  
      if (results.length === 0) {
        return res.status(401).json({ message: 'No such user exists' });
      }

      //console.log(results);
  
      if (password === results[0].Password) {
        const user = {
          SSN: results[0]['ID/SSN'],
          userType: results[0].User_type
        };
  
        // Store user information in the session
        req.session.user = user;
        console.log(user);

  
        const updateQuery = 'UPDATE `api_access` SET `Login_Time` = CURRENT_TIMESTAMP WHERE `ID/SSN` = ? AND User_Type = ?';
        connection.query(updateQuery, [SSN, userType], (updateError) => {
          if (updateError) {
            console.error('Error updating last login timestamp: ' + updateError.stack);
            return res.status(500).json({ message: 'Internal Server Error' });
          }
          console.log('Login Successful');
          return res.status(200).json({ message: 'Login successful. Welcome to the API' });
        });
      } else {
        console.log('Password Mismatch');
        return res.status(401).json({ message: 'Invalid credentials' });
      }
    });
})

app.get('/tokens', (req, res) => {
    //To get the access token
      const user = req.session.user;
  
      if (!user) {
          return res.status(401).json({ message: 'Unauthorized' });
      }
      console.log(user);
  
      const accessToken = generateAccessToken(user.SSN)
      const refreshToken = jwt.sign(user.SSN, process.env.REFRESH_TOKEN_SECRET)
      refreshTokens.push(refreshToken)
      
      res.status(200).json({ accessToken: accessToken , refreshToken : refreshToken});
});

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ message: 'Authorization Failed' });
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, userData) => {
        if (err) return res.status(403).json({ message: 'Token verification failed' });
        req.session.user = userData; // Store user data in session for later use
        next();
    });
}

function generateAccessToken(user) {
    const payload = { SSN: user.SSN }; // Extract the SSN from the user object
    return jwt.sign(payload, process.env.ACCESS_TOKEN_SECRET, {expiresIn : '20s'});
}
  
app.post('/refresh', (req,res)=>{
  //Generate a new access token
  const refreshToken = req.body.token
  if (refreshToken == null) return res.sendStatus(401)
  if (!refreshTokens.includes(refreshToken)) return res.sendStatus(401)
  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err,user)=>{
      if(err) return res.sendStatus(403)
      const accessToken = generateAccessToken({SSN : user.SSN})
      res.json({accessToken : accessToken})

  })

})

// Get all api users
app.get('/users', authenticateToken, (req, res) => {
    const user = req.session.user
  
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' })
    }
  
    connection.query(
      'SELECT `ID/SSN`, `User_Type`, `Password` FROM FROM `api_access`',
      (err, results) => {
        if (err) return res.status(500).json({ message: 'Internal Server Error' });
        res.status(200).json(results);
      }
    )
})

//Beginning to add the databse
// app.get('/users', authenticateToken ,(req,res)=>{
//     res.json(users.filter(user => user.name == req.user.name ))
// })

app.post('/users', async (req,res)=>{
    // const user = { name: req.body.name, password: req.body.password}
    // users.push(user) 
    // res.status(201).send()
    try{
        await bcrypt.genSalt()
        const hashedPassword = await bcrypt.hash(req.body.password, 10)
        let user = { name : req.body.name, password : hashedPassword}
        users.push(user)
        res.sendStatus(201).send()
    }catch{
        res.sendStatus(500).send()
    }    
})

app.post('/users/login', async (req,res)=>{
    //User Authentication
    const user = users.find(user => user.name == req.body.name)
    if (user == null) return res.sendStatus(400).send("Cannot find user")
    try{
        if(await bcrypt.compare(req.body.password, user.password)){

            const accessToken = generateAccessToken(user)
            const refreshToken = jwt.sign(user, process.env.REFRESH_TOKEN_SECRET)
            refreshTokens.push(refreshToken)
            res.json({accessToken : accessToken, refreshToken : refreshToken})

        }else{
            res.send("NOT ALLOWED")
        }
    }catch{
        res.sendStatus(500).send()
    }     
})

app.post('/token',(req,res)=>{
    const refreshToken = req.body.token
    if (refreshToken == null) return res.sendStatus(401)
    if (!refreshTokens.includes(refreshToken)) return res.sendStatus(401)
    jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err,user)=>{
        if(err) return res.sendStatus(403)
        const accessToken = generateAccessToken({name : user.name})
        res.json({accessToken : accessToken})

    })
})

app.delete('/logout',(req,res)=>{
    refreshTokens = refreshTokens.filter(token => token!=req.body.token)
    res.sendStatus(204)
})