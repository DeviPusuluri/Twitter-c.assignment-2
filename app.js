const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());

const databasePath = path.join(__dirname, "twitterClone.db");
let database = null;
const initializeDbAndStartServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
    process.exit(1);
  }
};

initializeDbAndStartServer();

const convertUserTableToResponseObject = (dbObject) => {
  return {
    userId: dbObject.user_id,
    name: dbObject.name,
    username: dbObject.username,
    password: dbObject.password,
    gender: dbObject.gender,
  };
};

const convertFollowerTableToResponseObject = (dbObject) => {
  return {
    followerId: dbObject.follower_id,
    followerUserId: dbObject.follower_user_id,
    followingUserId: dbObject.following_user_id,
  };
};

const convertTweetTableToResponseObject = (dbObject) => {
  return {
    userId: dbObject.user_id,
    tweetId: dbObject.tweet_id,
    tweet: dbObject.tweet,
    dateTime: dbObject.date_time,
  };
};

const convertReplyTableToResponseObject = (dbObject) => {
  return {
    userId: dbObject.user_id,
    replyId: dbObject.reply_id,
    reply: dbObject.reply,
    tweetId: dbObject.tweet_id,
    dateTime: dbObject.date_time,
  };
};

const convertLikeTableToResponseObject = (dbObject) => {
  return {
    userId: dbObject.user_id,
    likeId: dbObject.like_id,
    tweetId: dbObject.tweet_id,
    dateTime: dbObject.date_time,
  };
};

// API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `
    SELECT * FROM user 
    WHERE username='${username}';`;

  const dbUser = await database.get(selectUserQuery);
  if (dbUser) {
    response.status(400);
    response.send("User already exists");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    const addNewUserQuery = `
    INSERT INTO user(name,username,password,gender)
    VALUES ('${name}','${username}','${hashedPassword}','${gender}');`;
    await database.run(addNewUserQuery);
    response.status(200);
    response.send("User created successfully");
  }
});

// API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `
    SELECT * FROM user 
    WHERE username='${username}';`;
  const dbUser = await database.get(selectUserQuery);
  if (!dbUser) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (!isPasswordMatched) {
      response.status(400);
      response.send("Invalid password");
    } else {
      const payload = { username };
      const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    }
  }
});
// Authentication Middleware
const authenticateUser = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (!authHeader) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwtToken = authHeader.split(" ")[1];
    jwt.verify(jwtToken, "MY_SECRET_KEY", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

// API 3

app.get("/user/tweets/feed/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const followingUserQuery = `
SELECT following_user_id FROM follower
WHERE follower_user_id=${dbUser.user_id};`;
  const followingUsersObjectList = await database.all(followingUserQuery);
  const followingUsersList = followingUsersObjectList.map((i) => {
    return i["following_user_id"];
  });
  const getTweetsQuery = `
SELECT user.username AS username,
tweet.tweet AS tweet,
tweet.date_time AS dateTime
FROM tweet INNER JOIN user ON tweet.user_id=user.user_id
WHERE tweet.user_id IN (${followingUsersList})
ORDER  BY tweet.date_time  DESC
LIMIT 4;`;
  const tweets = await database.all(getTweetsQuery);
  response.send(tweets);
});

// API 4

app.get("/user/following/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const followingUserQuery = `
SELECT following_user_id FROM follower
WHERE follower_user_id=${dbUser.user_id};`;
  const followingUsersObjectList = await database.all(followingUserQuery);
  const followingUsersList = followingUsersObjectList.map((i) => {
    return i["following_user_id"];
  });
  const getUserQuery = `
SELECT user.name AS name 
FROM user 
WHERE user_id IN (${followingUsersList});`;
  const user = await database.all(getUserQuery);
  response.send(user);
});

// API 5

app.get("/user/followers/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const followerUserQuery = `
SELECT follower_user_id FROM follower
WHERE following_user_id=${dbUser.user_id};`;
  const followerUsersObjectList = await database.all(followerUserQuery);
  const followerUsersList = followerUsersObjectList.map((i) => {
    return i["follower_user_id"];
  });
  const getUserQuery = `
SELECT user.name AS name
FROM user 
WHERE user_id IN (${followerUsersList});`;
  const user = await database.all(getUserQuery);
  response.send(user);
});

// API 6

app.get("/tweets/:tweetId/", authenticateUser, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const selectUserQuery = `
SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
  const tweetInfo = await database.get(getTweetQuery);
  const followingUserQuery = `
SELECT following_user_id FROM follower
WHERE follower_user_id=${dbUser.user_id};`;
  const followingUsersObjectList = await database.all(followingUserQuery);
  const followingUsersList = followingUsersObjectList.map((i) => {
    return i["following_user_id"];
  });
  if (!followingUsersList.includes(tweetInfo.user_id)) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const { tweet_id, date_time, tweet } = tweetInfo;
    const getLikesQuery = `
    SELECT COUNT(like_id) AS likes FROM like
    WHERE tweet_id=${tweet_id} 
    GROUP BY tweet_id;`;
    const likesObject = await database.get(getLikesQuery);
    const getReplyQuery = `
    SELECT COUNT(reply_id) AS replies FROM reply
    WHERE tweet_id=${tweet_id} 
    GROUP BY tweet_id;`;
    const replyObject = await database.get(getReplyQuery);
    response.send({
      tweet,
      likes: likesObject.likes,
      replies: replyObject.replies,
      dateTime: date_time,
    });
  }
});

// API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `
SELECT * FROM user WHERE username='${username}';`;
    const dbUser = await database.get(selectUserQuery);
    const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
    const tweetInfo = await database.get(getTweetQuery);
    const followingUserQuery = `
SELECT following_user_id FROM follower
WHERE follower_user_id=${dbUser.user_id};`;
    const followingUsersObjectList = await database.all(followingUserQuery);
    const followingUsersList = followingUsersObjectList.map((i) => {
      return i["following_user_id"];
    });
    if (!followingUsersList.includes(tweetInfo.user_id)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const { tweet_id, date_time } = tweetInfo;
      const getLikedQuery = `
    SELECT user_id FROM like
    WHERE tweet_id=${tweetId};`;
      const likedUserIdObjectList = await database.all(getLikedQuery);
      const likedUserIdList = likedUserIdObjectList.map((i) => {
        return i.user_id;
      });
      const getLikedUserQuery = `
    SELECT username FROM user 
    WHERE user_id IN (${likedUserIdList});`;
      const getLikedUserObjectList = await database.all(getLikedUserQuery);
      const likedUsernameList = getLikedUserObjectList.map((i) => {
        return i.username;
      });
      response.send({
        likes: likedUsernameList,
      });
    }
  }
);

// API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateUser,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const selectUserQuery = `
SELECT * FROM user WHERE username='${username}';`;
    const dbUser = await database.get(selectUserQuery);
    const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};
  `;
    const tweetInfo = await database.get(getTweetQuery);
    const followingUserQuery = `
SELECT following_user_id FROM follower
WHERE follower_user_id=${dbUser.user_id};`;
    const followingUsersObjectList = await database.all(followingUserQuery);
    const followingUsersList = followingUsersObjectList.map((i) => {
      return i["following_user_id"];
    });
    if (!followingUsersList.includes(tweetInfo.user_id)) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const { tweet_id, date_time } = tweetInfo;
      const getUserRepliesQuery = `
    SELECT user.name AS name,reply.reply AS reply 
    FROM reply INNER JOIN user ON reply.user_id=user.user_id
    WHERE reply.tweet_id=${tweetId};`;
      const UserRepliesObjectList = await database.all(getUserRepliesQuery);
      response.send({
        replies: UserRepliesObjectList,
      });
    }
  }
);

// API 9

app.get("/user/tweets/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const { user_id } = dbUser;
  const getTwitterQuery = `
SELECT * FROM tweet WHERE user_id=${user_id} ORDER BY tweet_id;`;
  const tweetObjectList = await database.all(getTwitterQuery);
  const tweetIdList = tweetObjectList.map((i) => {
    return i.tweet_id;
  });
  const getLikesQuery = `
    SELECT COUNT(like_id) AS likes FROM like
    WHERE tweet_id IN (${tweetIdList}) 
    GROUP BY tweet_id
     ORDER BY tweet_id;`;
  const likesObject = await database.all(getLikesQuery);
  const getReplyQuery = `
    SELECT COUNT(reply_id) AS replies FROM reply
    WHERE tweet_id IN (${tweetIdList})  
    GROUP BY tweet_id
     ORDER BY tweet_id;`;
  const replyObject = await database.all(getReplyQuery);
  response.send(
    tweetObjectList.map((tweetObj, index) => {
      const likes = likesObject[index] ? likesObject[index].likes : 0;
      const replies = replyObject[index] ? replyObject[index].replies : 0;
      return {
        tweet: tweetObj.tweet,
        likes,
        replies,
        dateTime: tweetObj.date_time,
      };
    })
  );
});

// API 10

app.post("/user/tweets/", authenticateUser, async (request, response) => {
  const { username } = request;
  const selectUserQuery = `
SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await database.get(selectUserQuery);
  const { user_id } = dbUser;
  const { tweet } = request.body;
  const dateString = new Date().toISOString();
  const dateTime = dateString.slice(0, 10) + " " + dateString.slice(11, 19);
  const createNewTweetQuery = `
INSERT INTO tweet(tweet,user_id,date_time)
    VALUES('${tweet}','${user_id}','${dateTime}');`;
  await database.run(createNewTweetQuery);
  response.send("Created a Tweet");
});

// API 11

app.delete("/tweets/:tweetId/", authenticateUser, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const selectUserQuery = `
SELECT * FROM user WHERE username='${username}';`;
  const dbUser = await database.get(selectUserQuery);

  const getTweetQuery = `
  SELECT * FROM tweet WHERE tweet_id = ${tweetId};`;
  const tweetInfo = await database.get(getTweetQuery);

  if (dbUser.user_id !== tweetInfo.user_id) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const deleteTweetQuery = `
      DELETE FROM tweet 
      WHERE tweet_id=${tweetId};`;
    await database.run(deleteTweetQuery);
    response.send("Tweet Removed");
  }
});
module.exports = app;
