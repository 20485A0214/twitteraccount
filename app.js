const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')

const databasePath = path.join(__dirname, 'twitterClone.db')

const app = express()

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

app.use(express.json())

let database = null

const initializeDbAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () =>
      console.log('Server Running at http://localhost:3000/'),
    )
  } catch (error) {
    console.log(`DB Error: ${error.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

/*const convertUserTable = dbObject => {
  return {
    userId: dbObject.user_id,
    name: dbObject.name,
    username: dbObject.username,
    password: dbObject.password,
    gender: dbObject.gender,
  }
}

const convertFollowerTable = dbObject => {
  return {
    followerId: dbObject.follower_id,
    followerUserId: dbObject.follower_user_id,
    followingUserId: dbObject.following_user_id,
  }
}

const convertTweetTable = dbObject => {
  return {
    tweetId: dbObject.tweet_id,
    tweet: dbObject.tweet,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  }
}

const convertReplayTable = dbObject => {
  return {
    replayId: dbObject.replay_id,
    tweetId: dbObject.tweet_id,
    replay: dbObject.replay,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  }
}

const convertLikeTable = dbObject => {
  return {
    likeId: dbObject.like_id,
    tweetId: dbObject.tweet_id,
    userId: dbObject.user_id,
    dateTime: dbObject.date_time,
  }
}
*/

//middleware function

const aunthenticationToken = (request, response, next) => {
  let jwtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }

  if (jwtToken === undefined) {
    response.status(401)
    response.send('Invalid Access Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid Access Token')
      } else {
        request.userId = payload.userId
        console.log(payload)
        next()
      }
    })
  }
}

app.get('/follower/', async (request, response) => {
  const query = `
    SELECT * FROM follower
  `
  const a = await database.all(query)
  response.send(a)
})
//GET user details
app.get('/users/', aunthenticationToken, async (request, response) => {
  const getUserQuery = `
    SELECT * FROM
      user
      ORDER BY 
      user_id;
         `
  const userArray = await database.all(getUserQuery)
  response.send(userArray)
})
//Create User API

app.post('/register/', async (request, response) => {
  const {username, name, password, gender} = request.body
  const hashedPassword = await bcrypt.hash(password, 10)
  const selectUserQuery = `
   SELECT
   *
   FROM
   user
   WHERE
   username='${username}'
   `
  const dbUser = await database.get(selectUserQuery)

  if (dbUser === undefined) {
    const createUserQuery = `
     INSERT INTO
       user (username,name,password,gender)
     VALUES
      (
        '${username}',
        '${name}',
        '${hashedPassword}',
        '${gender}'
      );
     `

    if (password.length < 6) {
      response.send('Password is too short')
    } else {
      await database.run(createUserQuery)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//User Login API
app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const selectUserQuery = `
   SELECT
   *
   FROM
   user
   WHERE
   username='${username}';
   `
  const dbUser = await database.get(selectUserQuery)

  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    //compare password,hashed password
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password)
    if (isPasswordMatched === true) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

app.get('/user/following/', aunthenticationToken, async (request, response) => {
  let {username} = request
  try {
    const getFollower = `
  select 
  user.name 
  from 
  follower INNER JOIN user ON follower.following_user_id = user.user_id
  WHERE follower.following_user_id= (SELECT user_id FROM user WHERE username=?)`
    const following = await database.all(getFollower, [username])
    response.send(following)
    console.log(following)
  } catch (error) {
    console.error('Error fetching following list:', error)
    response.status(500).send('Internal Server Error')
  }
})

app.get(
  '/user/tweets/feed/',
  aunthenticationToken,
  async (request, response) => {
    let {username} = request

    const getTweets = `
  select
  user.username,
  tweet.tweet,
  tweet.date_time
  from 
  tweet INNER JOIN user ON tweet.user_id = (SELECT user_id FROM user WHERE username=?)`
    const tweet = await database.all(getTweets, username)
    response.send(tweet)
  },
)

app.get('/user/followers/', aunthenticationToken, async (request, response) => {
  let {username} = request
  try {
    const getFollowers = `
  select 
  user.name 
  from 
  follower INNER JOIN user ON follower.following_user_id = user.user_id
  WHERE follower.follower_user_id= (SELECT user_id FROM user WHERE username=?)`
    const follower = await database.all(getFollowers, [username])
    response.send(follower)
  } catch (error) {
    console.error('Error fetching following list:', error)
    response.status(500).send('Internal Server Error')
  }
})

app.get(
  '/tweets/:tweetId/',
  aunthenticationToken,
  async (request, response) => {
    const {tweetId} = request.params
    let {username} = request

    try {
      const checkFollowingQuery = `
       SELECT user_id FROM user
      WHERE user_id IN (
        SELECT user_id FROM tweet WHERE tweet_id = ?
      ) AND user_id IN (
        SELECT following_user_id FROM follower WHERE follower_user_id = ?
      )
    `
      const followingResult = await database.get(checkFollowingQuery, [
        tweetId,
        username,
      ])

      if (!followingResult) {
        // If the user is not following the user who posted the tweet, return 401
        return response.status(401).send('Invalid Request')
      }

      const getTweets = `
   select
   tweet.tweet,
   (SELECT COUNT(*) FROM like WHERE tweet_id = tweet.tweet_id) AS likes,
   (SELECT COUNT(*) FROM replay WHERE tweet_id = tweet.tweet_id) AS replies,
    tweet.date_time
    from
    tweet
    where
    tweet.tweet_id=(SELECT user_id FROM user WHERE username=?)
  `
      const tweet = await database.get(getTweets, [username])

      if (!tweetDetails) {
        return response.status(404).send('Tweet not found')
      }
      response.send(tweet)
    } catch (error) {
      console.error('Error fetching tweet details:', error)
      response.status(500).send('Internal Server Error')
    }
  },
)

module.exports = app
