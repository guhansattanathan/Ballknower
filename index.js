import express from "express";
import bodyParser from "body-parser";
import axios from "axios";
import pg from "pg";
import env from "dotenv";
import bcrypt from "bcrypt";

env.config();

//Setting up express
const app = express();
const PORT = process.env.PORT || 3000;

//Salt rounds
const saltRounds = 10;

//Middleware
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));

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
const db = new pg.Client({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT
});

db.connect();

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

        console.log(randomSeason);
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
    res.render("register.ejs");
})

//GET request to login page
app.get("/login", (req, res) => {
    res.render("login.ejs");
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
                await db.query("INSERT INTO users(username, password) VALUES($1, $2)", [username, hash]);
                res.redirect(`/?username=${username}`);  
              } catch(err){
                console.error(err);
                res.status(500).send("Cannot insert into DB");
              } 
              
            }
        })
        
    }catch(err){
        console.log(err);
        res.status(500).send("Error registering user");
    }
});

//POST request to login route that will authenticate the user

app.post("/login", async (req, res) => {

    console.log(req.body);
    const username = req.body.username;
    const password = req.body.password;

    try{
        const result = await db.query("SELECT * FROM users WHERE username = $1", [username]);

        if(result.rows.length > 0){
          const storedPassword = result.rows[0].password;
          bcrypt.compare(password, storedPassword, (err, result) => {
            if(err){
                console.log(err);
                res.status(500).send(err);
            } else {
                if(result){
                    res.redirect(`/?username=${username}`); 
                } else {
                    console.log("Incorrect password");
                }

            }
            });  
        } else {
            console.log("User not found");
        }
        
    } catch(err){
        console.log(err);
        res.status(500).send("Login error");
    }
});

//GET Request to render the homepage
app.get("/", (req, res) => {

  res.render("index.ejs", { username: req.query.username || null });

});


//GET Request that opens the starting page of CollegeCheck
app.get("/startCollegeCheck", (req, res) => {
    res.render("start-college-check.ejs");
});

//POST Request; When you click the start game button, the game starts at the CollegeCheck endpoint
app.post("/startCollegeCheck", (req, res) => {
    res.redirect("/CollegeCheck");
})

//Global variables to store the answers & score
let playerCollegeForAnswer = null;
let playerFirstNameForAnswer = null;
let playerLastNameForAnswer = null;
let score = 0
let maxScore = 0;
let lives = 3;
let streak = 0


/* 
GET Request to the CollegeCheck endpoint
Runs the game logic
*/
app.get("/CollegeCheck", async (req, res) => {

  try {

    if(req.query.result === "correct"){
        
        if(maxScore === score){
            score++
            maxScore++;
        } else {
            score++;
        }
    } else if(req.query.result === "incorrect"){
        score = 0;
    } else if(req.query.score){
        score = Number(req.query.score);
    }

    while (!playerCollegeForAnswer || !playerFirstNameForAnswer || !playerLastNameForAnswer) {
      let teamNumber = validTeams[Math.floor(Math.random() * validTeams.length)];
      console.log(teamNumber);
      let players = await getTeamPlayers(teamNumber);

      if (!players || players.length === 0) continue;

      const validPlayers = players.filter(p => p.college && p.firstname && p.lastname);
      if (validPlayers.length === 0) continue;

      const randomPlayer = validPlayers[Math.floor(Math.random() * validPlayers.length)];
      playerCollegeForAnswer = randomPlayer.college;
      playerFirstNameForAnswer = randomPlayer.firstname;
      playerLastNameForAnswer = randomPlayer.lastname;

      console.log(playerCollegeForAnswer);
    }

    const playerNameForAnswer = `${playerFirstNameForAnswer} ${playerLastNameForAnswer}`;
    const choicesArray = await generateOtherChoices(playerCollegeForAnswer);


    res.render("college-check.ejs", {
      player: playerNameForAnswer,
      choices: choicesArray,
      college: req.query.answer,
      result: req.query.result,
      score: score,
      maxScore,
      lives,
      streak
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
    console.log(req.body);
    const selected = req.body.option;
    const result = selected === playerCollegeForAnswer ? "correct" : "incorrect";
    const answer = playerCollegeForAnswer;

    const otherChoices = await generateOtherChoices(playerCollegeForAnswer);
    const allChoices = [selected, ...otherChoices.filter(c => c !== selected)];
    const shuffledChoices = allChoices.sort(() => 0.5 - Math.random());

    if(result === "correct"){
        
        if(maxScore === score){
            score++
            maxScore++;
            streak++
        } else {
            score++;
            streak++
        }
        } else if(result === "incorrect"){
            //score = 0;
            lives--
            streak = 0
        }

    res.render("college-check.ejs", {
        player: `${playerFirstNameForAnswer} ${playerLastNameForAnswer}`,
        choices: shuffledChoices,
        college: answer,
        result,
        score,
        maxScore,
        lives,
        streak
    });
});

/*
POST request the the skip endpoint
Allows the user the skip a question
Score and maxscore stay the same
*/
app.post("/skip", (req, res) => {
    playerCollegeForAnswer = null;
    streak = 0;
    let currentScore;
    if (score != 0){
        currentScore = score - 1;
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
    
    playerCollegeForAnswer = null;
    res.redirect("/CollegeCheck");
});

/*
POST Request to the restart endpoint
Button provided once game is over
Allows user to restart the game with 3 lives
MaxScore is preserved
*/
app.post("/restart", (req, res) => {
    
    score = 0;
    lives = 3;
    playerCollegeForAnswer = null;
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

//global variables for the NumberCheck games
let JerseyPlayerNumberForAnswer = null;
let JerseyPlayerFirstNameForAnswer = null;
let JerseyPlayerLastNameForAnswer = null;
let JerseyScore = 0
let JerseyMaxScore = 0;
let JerseyLives = 3;
let JerseyStreak = 0

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

    try {
        if(req.query.score){
            JerseyScore = Number(req.query.score);
        }

        while(!JerseyPlayerFirstNameForAnswer || !JerseyPlayerLastNameForAnswer || !JerseyPlayerNumberForAnswer){
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
            JerseyPlayerNumberForAnswer = randomPlayer.leagues.standard.jersey;
            JerseyPlayerFirstNameForAnswer = randomPlayer.firstname;
            JerseyPlayerLastNameForAnswer = randomPlayer.lastname;

            console.log(JerseyPlayerNumberForAnswer);
        }

        const JerseyPlayerNameForAnswer = `${JerseyPlayerFirstNameForAnswer} ${JerseyPlayerLastNameForAnswer}`;


        res.render("jersey-check.ejs", {
            player: JerseyPlayerNameForAnswer,
            number: JerseyPlayerNumberForAnswer,
            result: req.query.result,
            score: JerseyScore,
            maxScore:JerseyMaxScore,
            lives: JerseyLives,
            streak: JerseyStreak,
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
app.post("/JerseyCheck", (req, res) => {

    console.log(req.body);
    const selected = req.body.option;
    const answer = req.body.answer;
    const result = selected === answer ? "correct" : "incorrect";


    if(result === "correct"){
        
        if(JerseyMaxScore === JerseyScore){
            JerseyScore++
            JerseyMaxScore++;
            JerseyStreak++
        } else {
            JerseyScore++;
            JerseyStreak++
        }
    } else if(result === "incorrect"){
            //score = 0;
            JerseyScore = 0;
            JerseyLives--
            JerseyStreak = 0
    }

    res.render("jersey-check.ejs", {
        player: `${JerseyPlayerFirstNameForAnswer} ${JerseyPlayerLastNameForAnswer}`,
        number: answer,
        result,
        score: JerseyScore,
        maxScore: JerseyMaxScore,
        lives: JerseyLives,
        streak: JerseyStreak
    });

});

/* 
POST request to the JerseyNext endpoint
Allows the user to move on the next question
Renders a new question
*/
app.post("/JerseyNext", (req, res) => {
    
    JerseyPlayerNumberForAnswer = null;
    res.redirect("/JerseyCheck");
});

/* 
POST request to the JerseySkip endpoint
Allows the user to skip a question
Everything is kept the same but a point is taken off the score and the streak is reset
*/
app.post("/JerseySkip", (req, res) => {
    JerseyPlayerNumberForAnswer = null;
    JerseyStreak = 0;
    let currentScore;
    if (JerseyScore != 0){
        currentScore = JerseyScore - 1;
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
    
    JerseyScore = 0;
    JerseyLives = 3;
    JerseyStreak = 0;
    JerseyPlayerNumberForAnswer = null;
    res.redirect("/JerseyCheck");

});

//Server running on port 3000
app.listen(PORT, () => {
    console.log(`Listening on Port ${PORT}`);
});
