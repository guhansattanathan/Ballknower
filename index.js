import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";
import env from "dotenv";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import helmet from "helmet";
import compression from "compression";

env.config();

//Setting up express
const app = express();
const PORT = process.env.PORT || 3000;

//Salt rounds
const saltRounds = 10;

//Middleware
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));
app.use(helmet());
app.use(compression());

//Middleware to setup sessionss
app.use(session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 30
    }, 
}));

//Middlware for passport
app.use(passport.initialize());
app.use(passport.session());

//Middleware for creating session variables
app.use((req, res, next) => {
  if (!req.session.collegeGame) {
    req.session.collegeGame = {
      playerCollegeForAnswer: null,
      playerFirstNameForAnswer: null,
      playerLastNameForAnswer: null,
      score: 0,
      maxScore: 0,
      lives: 3,
      streak: 0,
      username: req.user ? req.user.username : null
    };
  }

  if (!req.session.jerseyGame) {
    req.session.jerseyGame = {
      JerseyPlayerNumberForAnswer: null,
      JerseyPlayerFirstNameForAnswer: null,
      JerseyPlayerLastNameForAnswer: null,
      JerseyScore: 0,
      JerseyMaxScore: 0,
      JerseyLives: 3,
      JerseyStreak: 0,
      username: req.user ? req.user.username : null
    };
  }

  next();
});

//Global Cache without session
let teamCache = {};

//Configuration for API
const configForCollege = {

    headers: {
    'x-rapidapi-key': process.env.RAPIDAPI_KEY,
    'x-rapidapi-host': process.env.RAPIDAPI_HOST
  }
}

//Configuration for Database
// const db = new pg.Client({
//     user: process.env.DB_USER,
//     host: process.env.DB_HOST,
//     password: process.env.DB_PASSWORD,
//     database: process.env.DB_DATABASE,
//     port: process.env.DB_PORT
// });

// db.connect();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});


//List containing the valid queries to get a team's data
const validTeams = [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15, 16, 17, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 38, 40, 41];

//List containining the valid years to query a team'a data
const validYears = [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024];
/*
Function used to perform the cache
If the team number alreadt exists then it just retrived based on the teamID key
If not, the call to the API is made and then the value is cached to the teamID key
*/
async function getTeamPlayers(teamID){

    const randomSeason = validYears[Math.floor(Math.random() * validYears.length)]
    const cacheKey = `${teamID}-${randomSeason}`;
    if (teamCache[cacheKey]){
        return teamCache[cacheKey]
    } else {

        const response = await axios.get(`https://api-nba-v1.p.rapidapi.com/players?season=${randomSeason}&team=${teamID}`, configForCollege)
        teamCache[cacheKey] = response.data["response"];
        return teamCache[cacheKey];
    }
}

/*
Function used to genereate 3 additional teams apart from the right answer
Returns a sorted array of all the choices
*/
async function generateOtherChoices(correctCollege) {
  const choices = new Set([correctCollege]);

  while (choices.size < 4) {
    const teamNumber = Math.floor(Math.random() * 30) + 1;
    const players = await getTeamPlayers(teamNumber);

    if (!players || players.length === 0) continue;

    const validPlayers = players.filter(p => p.college && !choices.has(p.college));
    if (validPlayers.length === 0) continue;

    const randomPlayer = validPlayers[Math.floor(Math.random() * validPlayers.length)];
    choices.add(randomPlayer.college);
  }

  return Array.from(choices).sort(() => 0.5 - Math.random());
}

//GET request to register page
app.get("/register", (req, res) =>{
    if(req.query.success === "false"){
        res.render("register.ejs", {message: "This username is already taken!"});
    } else {
    res.render("register.ejs");
    }
})

//GET request to login page
app.get("/login", (req, res) => {
    if(req.query.success === "false"){
        res.render("login.ejs", {message: "Incorrect username/password, check again!"})
    } else {
      res.render("login.ejs");  
    }
})

//POST request to register route that will insert user info into the database
app.post("/register", async (req, res) => {
    try{
        console.log(req.body);
        const username = req.body.username;
        const password = req.body.password;
        
        bcrypt.hash(password, saltRounds, async (err, hash) =>{
            if(err){
                console.log(err);
                res.status(500).send("Cannot configure password");
            } else {

              try{
                const result = await pool.query("INSERT INTO users(username, password) VALUES($1, $2) RETURNING *", [username, hash]);
                const user = result.rows[0];
                
                req.session.collegeGame.username = username;

                req.login(user, (err) => {
                    if (err) {
                        console.log(err);
                        return res.status(500).send("Login after register failed");
                    }
                    return res.redirect("/");
                });
                
              } catch(err){
                console.error(err);

                res.redirect("/register?success=false");
              } 
              
            }
        })
        
    }catch(err){
        console.log(err);
        res.status(500).send("Error registering user");
    }
});

//POST request to login route that will authenticate the user

app.post("/login", passport.authenticate("local", {
    
    successRedirect: "/",
    failureRedirect: "/login?success=false"
}))

//POST request to logout

app.post("/logout", (req, res) => {
    req.logout((err) => {
        if(err){
            console.log(err);
        } else {
            res.redirect("/");
        }
    });
});

/* 
Leaderboard implementation starts here
*/

app.get("/leaderboards", async (req, res) => {

    try{
        const leadersForCollegeCheck = await pool.query("SELECT username, collegecheckhs FROM users ORDER BY collegecheckhs DESC LIMIT 20");
        const leadersForNumberCheck = await pool.query("SELECT username, numbercheckhs FROM users ORDER BY numbercheckhs DESC LIMIT 20")
        
        const CollegeLeadersArray = [...leadersForCollegeCheck.rows];
        const NumberLeadersArray = [...leadersForNumberCheck.rows];
        
        res.render("leaderboard.ejs", {
            CollegeLeadersArray,
            NumberLeadersArray
        });

    } catch(err){
        res.status(504).send("Cannot retrieve data at the moment");
    }
});

//GET Request to render the homepage
app.get("/", (req, res) => {

    if(req.isAuthenticated()){
        res.render("index.ejs", {username: req.user.username});
    } else {
        res.render("index.ejs");
    }

});


//GET Request that opens the starting page of CollegeCheck
app.get("/startCollegeCheck", (req, res) => {
    res.render("start-college-check.ejs");
});

//POST Request; When you click the start game button, the game starts at the CollegeCheck endpoint
app.post("/startCollegeCheck", (req, res) => {
    res.redirect("/CollegeCheck");
})


/* 
GET Request to the CollegeCheck endpoint
Runs the game logic
*/
app.get("/CollegeCheck", async (req, res) => {

    const game = req.session.collegeGame;

  try {

    if(req.query.result === "correct"){
        
        if(game.maxScore === game.score){
            game.score++
            game.maxScore++;
        } else {
            game.score++;
        }
    } else if(req.query.result === "incorrect"){
        game.score = 0;
    } else if(req.query.score){
        game.score = Number(req.query.score);
    }

    while (!game.playerCollegeForAnswer || !game.playerFirstNameForAnswer || !game.playerLastNameForAnswer) {
      let teamNumber = validTeams[Math.floor(Math.random() * validTeams.length)];
      
      let players = await getTeamPlayers(teamNumber);

      if (!players || players.length === 0) continue;

      const validPlayers = players.filter(p => p.college && p.firstname && p.lastname);
      if (validPlayers.length === 0) continue;

      const randomPlayer = validPlayers[Math.floor(Math.random() * validPlayers.length)];
      game.playerCollegeForAnswer = randomPlayer.college;
      game.playerFirstNameForAnswer = randomPlayer.firstname;
      game.playerLastNameForAnswer = randomPlayer.lastname;

    }

    const playerNameForAnswer = `${game.playerFirstNameForAnswer} ${game.playerLastNameForAnswer}`;
    const choicesArray = await generateOtherChoices(game.playerCollegeForAnswer);


    res.render("college-check.ejs", {
      player: playerNameForAnswer,
      choices: choicesArray,
      college: req.query.answer,
      result: req.query.result,
      score: game.score,
      maxScore: game.maxScore,
      lives: game.lives,
      streak: game.streak
    });

  } catch (error) {
    console.error("CollegeCheck error:", error.message);
    res.status(500).send("Server error. Please try again later.");
  }
});

/*
POST request to the CheckCollege endpoint
Verifies whether the user picked the right answer
Does not move on the next question until the Next button is clicked
*/
app.post("/CollegeCheck", async (req, res) => {

    const game = req.session.collegeGame;

    const selected = req.body.option;
    const result = selected === game.playerCollegeForAnswer ? "correct" : "incorrect";
    const answer = game.playerCollegeForAnswer;

    const otherChoices = await generateOtherChoices(game.playerCollegeForAnswer);
    const allChoices = [selected, ...otherChoices.filter(c => c !== selected)];
    const shuffledChoices = allChoices.sort(() => 0.5 - Math.random());

    if(result === "correct"){
        
        if(game.maxScore === game.score){
            game.score++
            game.maxScore++;
            game.streak++
        } else {
            game.score++;
            game.streak++
        }
        } else if(result === "incorrect"){
            game.lives--
            game.streak = 0
        }

    if(game.lives === 0){

        if(game.username){
            const username = game.username;
            const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
            const storedMaxscore = result.rows[0].collegecheckhs;
            if(game.maxScore > storedMaxscore){
                await pool.query("UPDATE users SET collegecheckhs = $1 WHERE username = $2", [game.maxScore, username]);
            }
        }   
    }
        

    res.render("college-check.ejs", {
        player: `${game.playerFirstNameForAnswer} ${game.playerLastNameForAnswer}`,
        choices: shuffledChoices,
        college: answer,
        result,
        score: game.score,
        maxScore: game.maxScore,
        lives: game.lives,
        streak: game.streak
    });
});

/*
POST request the the skip endpoint
Allows the user the skip a question
Score and maxscore stay the same
*/
app.post("/skip", (req, res) => {

    const game = req.session.collegeGame;
    game.playerCollegeForAnswer = null;
    game.streak = 0;
    let currentScore;
    if (game.score != 0){
        currentScore = game.score - 1;
    } else {
        currentScore = 0;
    }
    res.redirect(`/CollegeCheck?score=${currentScore}`);
})

/*
POST Request to the next endpoint
Moves on the next question when the button is clicked
Must set college answer to null it generate a new player/college question
*/
app.post("/next", (req, res) => {
    
    const game = req.session.collegeGame;
    game.playerCollegeForAnswer = null;
    res.redirect("/CollegeCheck");
});

/*
POST Request to the restart endpoint
Button provided once game is over
Allows user to restart the game with 3 lives
MaxScore is preserved
*/
app.post("/restart", (req, res) => {

    const game = req.session.collegeGame;
    
    game.score = 0;
    game.lives = 3;
    game.playerCollegeForAnswer = null;
    res.redirect("/CollegeCheck");
});
/*
POST Request to the exit endpoint
Redirects you to the homepage upon clicking
*/
app.post("/exit", (req, res) => {
    res.redirect("/");
})

///////////////////////////////////////////////////////////////////////////////////////////////


//Allows the user to go to the starting page of the NumberCheck game
app.get("/startJerseyCheck", (req, res) => {
    res.render("start-jersey-check.ejs");
});

//Allows the user to start the game by making a get request to JerseyCheck
app.post("/startJerseyCheck", (req, res) => {
    res.redirect("/JerseyCheck");
});

/* 
GET request to the JerseySkip endpoint
Renders the game page with a new question
*/
app.get("/JerseyCheck", async (req, res) => {

    const game = req.session.jerseyGame;

    try {
        if(req.query.score){
            game.JerseyScore = Number(req.query.score);
        }

        while(!game.JerseyPlayerFirstNameForAnswer || !game.JerseyPlayerLastNameForAnswer || !game.JerseyPlayerNumberForAnswer){
            let teamNumber = validTeams[Math.floor(Math.random() * validTeams.length)];
            let players = await getTeamPlayers(teamNumber);

            if(!players || players.length === 0){
                continue;
            }

           const validPlayers = players.filter(p => 
                p.leagues && 
                p.leagues.standard && 
                p.leagues.standard.jersey &&
                p.firstname && 
                p.lastname
            );

            if (validPlayers.length === 0) continue;

            const randomPlayer = validPlayers[Math.floor(Math.random() * validPlayers.length)];
            game.JerseyPlayerNumberForAnswer = randomPlayer.leagues.standard.jersey;
            game.JerseyPlayerFirstNameForAnswer = randomPlayer.firstname;
            game.JerseyPlayerLastNameForAnswer = randomPlayer.lastname;

        }

        const JerseyPlayerNameForAnswer = `${game.JerseyPlayerFirstNameForAnswer} ${game.JerseyPlayerLastNameForAnswer}`;


        res.render("jersey-check.ejs", {
            player: JerseyPlayerNameForAnswer,
            number: game.JerseyPlayerNumberForAnswer,
            result: req.query.result,
            score: game.JerseyScore,
            maxScore: game.JerseyMaxScore,
            lives: game.JerseyLives,
            streak: game.JerseyStreak,
        });
    }catch(error){
        console.error("CollegeCheck error:", error.message);
        res.status(500).send("Server error. Please try again later.");
    }
})

/* 
POST request to the JerseyCheck endpoint
Compares the users answer to the right answer and displays the approporiate message
Does not move to the next question until the user clicks next
*/
app.post("/JerseyCheck", async (req, res) => {

    const game = req.session.jerseyGame;

    const selected = req.body.option;
    const answer = req.body.answer;
    const result = Number(selected) === Number(answer) ? "correct" : "incorrect";

    if(result === "correct"){
        
        if(game.JerseyMaxScore === game.JerseyScore){
            game.JerseyScore++
            game.JerseyMaxScore++;
            game.JerseyStreak++
        } else {
            game.JerseyScore++;
            game.JerseyStreak++
        }
    } else if(result === "incorrect"){
            //score = 0;
            
            game.JerseyLives--
            game.JerseyStreak = 0
    }

    if(game.JerseyLives === 0){

        if(game.username){
            const username = game.username;
            const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
            const storedMaxscore = result.rows[0].numbercheckhs;
            if(game.JerseyMaxScore > storedMaxscore){
                await pool.query("UPDATE users SET numbercheckhs = $1 WHERE username = $2", [game.JerseyMaxScore, username]);
            }
        }   
    }

    res.render("jersey-check.ejs", {
        player: `${game.JerseyPlayerFirstNameForAnswer} ${game.JerseyPlayerLastNameForAnswer}`,
        number: answer,
        result,
        score: game.JerseyScore,
        maxScore: game.JerseyMaxScore,
        lives: game.JerseyLives,
        streak: game.JerseyStreak
    });

});

/* 
POST request to the JerseyNext endpoint
Allows the user to move on the next question
Renders a new question
*/
app.post("/JerseyNext", (req, res) => {

    const game = req.session.jerseyGame;
    
    game.JerseyPlayerNumberForAnswer = null;
    res.redirect("/JerseyCheck");
});

/* 
POST request to the JerseySkip endpoint
Allows the user to skip a question
Everything is kept the same but a point is taken off the score and the streak is reset
*/
app.post("/JerseySkip", (req, res) => {

    const game = req.session.jerseyGame;

    game.JerseyPlayerNumberForAnswer = null;
    game.JerseyStreak = 0;
    let currentScore;
    if (game.JerseyScore != 0){
        currentScore = game.JerseyScore - 1;
    } else {
        currentScore = 0;
    }
    res.redirect(`/JerseyCheck?score=${currentScore}`);
})

/* 
POST request to the Jersey Restart endpoint
Restarts the game by resetting your score, lives and streak
*/
app.post("/JerseyRestart", (req, res) => {
    
    const game = req.session.jerseyGame;

    game.JerseyScore = 0;
    game.JerseyLives = 3;
    game.JerseyStreak = 0;
    game.JerseyPlayerNumberForAnswer = null;
    res.redirect("/JerseyCheck");

});

//Implementing passport strategy

passport.use(new Strategy(async function verify(username, password, cb) {

    try{
        const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);

        if(result.rows.length > 0){
          const user = result.rows[0];
          const storedPassword = user.password;
          bcrypt.compare(password, storedPassword, (err, result) => {
            if(err){
                // console.log(err);
                // res.status(500).send(err);
                return cb(err);
            } else {
                if(result){
                    // res.redirect(`/?username=${username}`); 
                    return cb(null, user);
                } else {
                    // console.log("Incorrect password");
                    return cb(null, false);
                }
            }
            });  
        } else {
            // console.log("User not found");
            return cb(null, false);
        }
        
    } catch(err){
        // console.log(err);
        // res.status(500).send("Login error");
        return cb(err);
    }

}));

passport.serializeUser((user, cb) => {
    cb(null, user);
});

passport.deserializeUser((user, cb) => {
    cb(null, user);
});
//Server running on port 3000
app.listen(PORT, () => {
    console.log(`Listening on Port ${PORT}`);
});
