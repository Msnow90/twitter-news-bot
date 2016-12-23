var twit = require("twit");
var config = require("./config.js");
var qs = require("querystring");
var request = require("request");
var Q = require("q");
var parseString = require("xml2js").parseString;
var newsConfig = require("./news-config");


//var Twitter = new twit(config);


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

        else {
          var article = result["rss"]["channel"][0].item[0];
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

  var content = qs.unescape(String(article["content:encoded"]));

  // regex expression that removes all html tags :D
  var regexTags = /(<([^>]+)>)/ig;
  // this regex I made myself :D, finds all numerical identities for certain symbols
  var regexComma = /(&[#]\d{4}[s])/g;
  var regexCode = /(&[#]\d{4})/g;

  // remove all unwanted characters from the organic words
  var t = content.replace(regexTags, " ").replace(/,/g, "").replace(/"/g, "").replace(/\(/g, "")
  .replace(/\)/g, "").replace(/\./g, "").replace(/;/g, "").replace(/:/g, "").replace(regexComma, "")
  .replace(regexCode, "");

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
    var returnObj = {};
    returnObj[wordHolder] = countHolder;
    return returnObj;
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
  deferred.resolve(formattedArticle);

  return deferred.promise;
}





// encompasses the entire promise chain, since each function builds on one another
function startChain(site){
  fetchNews(site)
  .then(function(article){
    //return shortenURL(article);
    return generateTags(article);
  })
  .then(function(article){
    //return generateTags(article);
  console.log(article);
  })
  .then(function(result){
    console.log(result);
  })
  .catch(function(error){
    console.log(error);
  })
};

// Will keep track of which news site bot pulls from
var newsCounter = 0;
setInterval(function(){
  if (newsCounter == newsConfig.length) newsCounter = 0;
  startChain(newsConfig[newsCounter]);
  newsCounter++;
},10000)
 //startChain();
