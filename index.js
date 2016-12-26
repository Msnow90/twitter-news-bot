var twit = require("twit");
var config = require("./config.js");
var qs = require("querystring");
var request = require("request");
var Q = require("q");
var parseString = require("xml2js").parseString;
var newsConfig = require("./news-config");


var Twitter = new twit(config);

// articleCache will contain the last reference to articles already tweeted
var articleCache = [];

for (var i = 0; i < newsConfig.length; ++i){
  articleCache[i] = {
    title: "",
    url: "",
    hashTags: []
  };
}


// Will keep track of which news site bot pulls from as well as which index
// the cached articles are stored on. Since the counter aligns with the news site
// from the config file, it will be the same reference in our articleCache var.
var newsCounter = 0;


// getData function used as a generic callback
function getData (err, data, res){
  if (err) console.log(err);
  console.log(data);
};



// shortenURL function used to call bit.ly's API
function shortenURL(article){

  var deferred = Q.defer();
  var apiURL = "https://api-ssl.bitly.com/v3/shorten?access_token=11ab23a384b805d97053dc09a0350d3f5012d606&longUrl=";

  var url = qs.escape(article["link"]);


  request(apiURL + url, function(err, response, body){

    if (err || response.statusCode != 200) deferred.reject(`Failed to shorten the URL:  ${url}.`);

    else {
      var body = JSON.parse(body);
      //var result = body["data"]["url"];
      article["shortURL"] = body["data"]["url"].replace("http://", "");
      deferred.resolve(article);
    }

  })
  return deferred.promise;
};

// fetchNews pulls an article from a specified news site and returns it in a promise
function fetchNews(site){

  var deferred = Q.defer();
  request(site, function(err, response, body){

    if (err || response.statusCode != 200) deferred.reject(`Failed to make a request to news site:  ${site}.`);

    else {

      parseString(body, function(err, result){

        if (err) deferred.reject(`Failed to make a request to news site:  ${site}.`);


        /*else if (newsArticle["url"] == articleCache[newsCounter]["url"]){
          return console.log("Article already processed by this bot.");
        }
        else {
          articleCache[newsCounter] = newsArticle;
          // ***  post to twitter;
          console.log(articleCache[newsCounter]);
        }*/



        else {
          var article = result["rss"]["channel"][0].item[0];


          if (String(article["title"]) == String(articleCache[newsCounter]["title"])) {
            newsCounter++;
            return deferred.reject(`Already parsed the article titled: ${article.title}`);
          }
          deferred.resolve(article);
        }
      })
    }
  })

  return deferred.promise;
};

// generateTags breaks down the entire article, counts the word usage and generates 3-5 hashtags
function generateTags(article){

  var deferred = Q.defer();
  var content;

  if (article["content:encoded"] == undefined) content = qs.unescape(String(article["description"]));
  else content = qs.unescape(String(article["content:encoded"]));


  // regex expression that removes all html tags :D
  var regexTags = /(<([^>]+)>)/ig;
  // this regex I made myself :D, finds all numerical identities for certain symbols
  var regexComma = /(&[#]\d{4}[s])/g;
  var regexCode = /(&[#]\d{4})/g;

  // remove all unwanted characters from the organic words
  var t = content.replace(regexTags, " ").replace(/,/g, "").replace(/"/g, "").replace(/\(/g, "")
  .replace(/\)/g, "").replace(/\./g, "").replace(/;/g, "").replace(/:/g, "").replace(regexComma, "")
  .replace(regexCode, "").replace(/-/g, "");

  // split words into an array containing an element for every word
  var t2 = t.split(" ");

  // next step is to remove all items in test array with 4 chars or less
  // this function serves as the value check for the array's method filter
  function checkStr(str){
    return str.length > 4;
  }
  // filter runs each element through checkStr func and creates new array with passing values
  var test = t2.filter(checkStr);

  // wordCounterObj keeps track of word (as the property) and it's usage count (value)
  var wordCounterObj = {};
  // iterates through array and creates new property if unused word
  // increments value if the word already exists
  for (var i = 0; i < test.length; ++i){
    if (!wordCounterObj[test[i]]){
      wordCounterObj[test[i]] = 1;
    }
    else {
      wordCounterObj[test[i]]++;
    }
  }

  // need to order the wordCounterObj by top 5 words
  // var maxCollection = []; -- will contain the 5 words with highest usage count
  // var max = {}; will contain the highest usage count and word
  // after finding max will remove that item and property from the wordCounterObj

  var maxCollection = [];

  // limit the number of hashtags by word count
  var wordCount = t2.length;
  var hashTagLimit;

  if (wordCount >= 500) hashTagLimit = 5;
  else hashTagLimit = 3;

  function maxUsageFinder(){
    var wordHolder = "";
    var countHolder = 0;
    for (obj in wordCounterObj){
      if (wordCounterObj[obj] > countHolder){
        countHolder = wordCounterObj[obj];
        wordHolder = String(obj);
      }
    }
    delete wordCounterObj[wordHolder];
    //var returnObj = {};
    //returnObj[wordHolder] = countHolder;
    return  "#" + wordHolder;
  }

  for (var j = 0; j < hashTagLimit; ++j){
    var hashTagWord = maxUsageFinder();
    maxCollection.push(hashTagWord);
  }
  var formattedArticle = {
    title: article["title"],
    url: article["shortURL"],
    hashTags: maxCollection
  };

  // Must set the articleCache here, since in the interval the promise object will not return in time
  articleCache[newsCounter] = formattedArticle;
  newsCounter++;

  deferred.resolve(formattedArticle);

  return deferred.promise;
}

//send out tweet
function sendTweet(article){
  console.log(article);
  var deferred = Q.defer();
  // need to shorten title to preserve characters for twitter's limit
  var shortTitle;
  if (article["title"][0].length > 50) shortTitle = article["title"][0].substr(0,50) + "...";
  else shortTitle = article["title"][0];
  console.log(shortTitle.length);
  var hashTags = "";
  for (var i = 0; i < article["hashTags"].length; ++i){
    hashTags += (article["hashTags"][i] + " ");
  }
  Twitter.post("statuses/update", {status: `${shortTitle}, ${article["url"]}, ${hashTags}`}, function(err, res){
    if (err) return console.log(err);
    deferred.resolve(res);
  });
  return deferred.promise;
}



// encompasses the entire promise chain, since each function builds on one another
function startChain(site){
  fetchNews(site)
  .then(function(article){
    return shortenURL(article);
    //return generateTags(article);
  })
  .then(function(article){
    return generateTags(article);
  //console.log(article);
  })
  .then(function(article){
    return sendTweet(article);
  })
  .catch(function(error){
    console.log(error);
  })
};

//console.log(newsConfig.length);
setInterval(function(){
  // reset newsCounter variable if out of range of our news site array
  //console.log(`News counter at: ${newsCounter}, news config length at: ${newsConfig.length}`);
  if (newsCounter == newsConfig.length){
    newsCounter = 0;
  }
  // call promise chain, error checking needs to be done inside promise chain
  // this is because main thread of the interval continues despite promise
  // not being returned
  startChain(newsConfig[newsCounter]);
  // change time in MS to something more reasonable, perhaps every 30 mins. 1,800,000 ms
},1800000);

 // Use below method for quicktesting
 //startChain(newsConfig[0]);
