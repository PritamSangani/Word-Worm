// Route the incoming request based on type (LaunchRequest, IntentRequest,
// etc.) The JSON body of the request is provided in the event parameter.

var http = require("http")

exports.handler = function (event, context) {
	try {
		console.log("event.session.application.applicationId=" + event.session.application.applicationId)

        /**
         * Uncomment this if statement and populate with your skill"s application ID to
         * prevent someone else from configuring a skill that sends requests to this function.
         */
        /*
        if (event.session.application.applicationId !== "amzn1.echo-sdk-ams.app.[unique-value-here]") {
             context.fail("Invalid Application ID")
        }
        */

        if (event.session.new) {
        	onSessionStarted({requestId: event.request.requestId}, event.session)
        }

        if (event.request.type == "LaunchRequest") {
        	onLaunch(event.request,
        		event.session,
        		function callback(sessionAttributes, speechletResponse) {
        			context.succeed(buildResponse(sessionAttributes, speechletResponse))
        		})
        } else if (event.request.type == "IntentRequest") {
        	onIntent(event.request,
        		event.session,
        		function callback(sessionAttributes, speechletResponse) {
        			context.succeed(buildResponse(sessionAttributes, speechletResponse))
        		})
        } else if (event.request.type == "SessionEndedRequest") {
        	onSessionEnded(event.request, event.session)
        	context.succeed()
        }
    } catch (e) {
    	context.fail("Exception: " + e)
    }
}

/**
 * Called when the session starts.
 */
 function onSessionStarted(sessionStartedRequest, session) {
 	console.log("onSessionStarted requestId=" + sessionStartedRequest.requestId +
 		", sessionId=" + session.sessionId)
 }

/**
 * Called when the user launches the skill without specifying what they want.
 */
 function onLaunch(launchRequest, session, callback) {
 	console.log("onLaunch requestId=" + launchRequest.requestId +
 		", sessionId=" + session.sessionId)

    // Dispatch to your skill"s launch.
    getWelcomeResponse(callback)
}

/**
 * Called when the user specifies an intent for this skill.
 */
 function onIntent(intentRequest, session, callback) {
 	var intent = intentRequest.intent,
 	intentName = intentRequest.intent.name

    // Dispatch to your skill"s intent handlers
    if (intentName == "ThesaurusIntent") {
    	handleGetSynonymResponse(intent, session, callback)
    } else if (intentName == "AMAZON.HelpIntent") {
    	handleGetHelpResponse(intent, session, callback)
    } else if (intentName == "AMAZON.StopIntent" || intentName == "AMAZON.CancelIntent") {
    	handleFinishSessionResponse(intent, session, callback)
    } else {
    	throw "Invalid intent"
    }
}

/**
 * Called when the user ends the session.
 * Is not called when the skill returns shouldEndSession=true.
 */
 function onSessionEnded(sessionEndedRequest, session) {
    // Add Cleanup logic here
}

// --------------- Functions that control the skill"s behavior -----------------------

function getWelcomeResponse(callback) {
	var speechOutput = "Welcome to WordWorm. " + "I can find synonyms for words. " + "What word would you like a word for?" 
	var reprompt = "I can give you help if you are stuck. Just say help."
	var header = "Welcome to WordWorm"
	var shouldEndSession = false
	var sessionAttributes = {
		"speechOutput" : speechOutput,
		"repromptText" : reprompt
	}

	callback(sessionAttributes, buildSpeechletResponse(header, speechOutput, reprompt, shouldEndSession))
}

function handleGetHelpResponse(intent, session, callback) {
    // Ensure that session.attributes has been initialized
    if (!session.attributes) {
    	session.attributes = {}
    }
    var speechOutput = "To use WordWorm you should say a word that you would like a synonym for." + "I can only help you with single words. For example, say car not race car"
    var reprompt = "Go ahead, say a word you would like a synonym for"
    var shouldEndSession = false

    callback(session.attributes, buildSpeechletResponseWithoutCard(speechOutput, reprompt, shouldEndSession))
}

function handleFinishSessionResponse(intent, session, callback) {
	var speechOutput = "Goodbye! Thank you for using WordWorm. Have a great day!"
	var reprompt = null
	var shouldEndSession = true

	callback(session.attributes, buildSpeechletResponseWithoutCard(speechOutput, reprompt, shouldEndSession))
}




function makeThesaurusRequest(word, thesaurusResponseCallback) {

	if (word==undefined) {
		thesaurusResponseCallback(new Error("undefined"))
	}

	var query_url ="http://words.bighugelabs.com/api/2/bde724b00ebb83abddbef989479a2148/" + word + "/json"
	var body = ""
	var jsonObject

	http.get(query_url, (res) => {
		if (res.statusCode==200) {
			res.setEncoding("utf8")
			res.on("data", function (chunk) {
				body += chunk
			})
			res.on("end", () => {
				jsonObject = JSON.parse(body)
				thesaurusResponseCallback(null, body)
			})
		}
		else if (res.statusCode==303) {
			query_url ="http://words.bighugelabs.com/api/2/bde724b00ebb83abddbef989479a2148/" +res.statusMessage + "/json"
			http.get(query_url, (res2) => {
				res2.setEncoding("utf8")
				res2.on("data", function (chunk) {
					body += chunk
				})
				res2.on("end", () => {
					jsonObject = JSON.parse(body)
					thesaurusResponseCallback(null, body)
				})
			})
		}
		else {
			thesaurusResponseCallback(new Error(res.statusCode))
		}
	}).on("error", (e) => {
		thesaurusResponseCallback(new Error(e.message))
	})
}

function handleGetSynonymResponse(intent, session, callback) {
	var queryword = intent.slots.queryword.value
	var header = "Synonyms for: " + capitaliseFirst(queryword)
	var speechOutput = ""
	var reprompt = null
	var shouldEndSession = true

	var maxLength = 0

	makeThesaurusRequest(queryword, function thesaurusResponseCallback(err, thesaurusResponseBody) {
		var speechOutput

		if (err) {
			if (err=="undefined"){
				speechOutput = "Sorry, the Thesaurus service can only handle single word, for example car. Multiple words such as race car, marching band, tuna fish and golden retriever will not work."
			}
			else {
				speechOutput = "Sorry, the Thesaurus service is experiencing a problem with your request. Try again or try a different singular word."
			}

		} else {

			var thesaurusResponse = JSON.parse(thesaurusResponseBody)

			speechOutput = "Here is what I have found: "

			if (thesaurusResponse.hasOwnProperty("noun")) {
				var nounSynonyms = shuffleArray(thesaurusResponse.noun.syn)
				speechOutput += capitaliseFirst(queryword) + ", used as a noun, has the following synonyms: "
				maxLength = Object.keys(nounSynonyms).length

				if(maxLength > 5)
				{
					maxLength = 5
				}

				for(var i = 0; i < maxLength; i++) {
					if (i > 0){
						speechOutput += " , "
					}
					speechOutput +=  nounSynonyms[i]

				}
				speechOutput += ". "
			}

			if (thesaurusResponse.hasOwnProperty("verb")){
				var verbSynonyms = shuffleArray(thesaurusResponse.verb.syn)
				speechOutput += capitaliseFirst(queryword) + ", used as a verb, has the following synonyms: "
				maxLength = Object.keys(verbSynonyms).length
				if (maxLength > 5)
				{
					maxLength = 5
				}

				for(var i = 0; i < maxLength; i++) {
					if (i > 0){
						speechOutput += " , "
					}
					speechOutput +=  verbSynonyms[i]

				}
				speechOutput += ". "
			}

			if (thesaurusResponse.hasOwnProperty("adverb")){
				var adverbSynonyms = shuffleArray(thesaurusResponse.adverb.syn)
				speechOutput += capitaliseFirst(queryword) + ", used as an adverb, hs the following synonyms: "
				maxLength = Object.keys(adverbSynonyms).length
				if (maxLength > 5)
				{
					maxLength = 5
				}

				for(var i = 0; i < maxLength; i++) {
					if (i > 0){
						speechOutput += " , "
					}
					speechOutput +=  adverbSynonyms[i]

				}
				speechOutput += ". "
			}

			if (thesaurusResponse.hasOwnProperty("adjective")){
				var adjectiveSynonyms = shuffleArray(thesaurusResponse.adjective.syn)
				speechOutput += capitaliseFirst(queryword) + ", used as a verb, has the following synonyms: "
				maxLength = Object.keys(adjectiveSynonyms).length
				if (maxLength > 5)
				{
					maxLength = 5
				}

				for(var i = 0; i < maxLength; i++) {
					if (i > 0){
						speechOutput += " , "
					}
					speechOutput +=  adjectiveSynonyms[i]

				}
				speechOutput += ". "
			}

		}

		callback(session.attributes,
			buildSpeechletResponse(header, speechOutput, reprompt, shouldEndSession))
	})

}

// --------------- Extra Functionality Function -----------------------

function capitaliseFirst(s) {
	return s.charAt(0).toUpperCase() + s.slice(1)
}

function shuffleArray(array) {
  var currentIndex = array.length, temporaryValue, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    // And swap it with the current element.
    temporaryValue = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = temporaryValue;
  }

  return array;
}


// --------------- Helpers that build all of the responses -----------------------

function buildSpeechletResponse(title, output, repromptText, shouldEndSession) {
	return {
		outputSpeech: {
			type: "PlainText",
			text: output
		},
		card: {
			type: "Simple",
			title: title,
			content: output
		},
		reprompt: {
			outputSpeech: {
				type: "PlainText",
				text: repromptText
			}
		},
		shouldEndSession: shouldEndSession
	}
}

function buildSpeechletResponseWithoutCard(output, repromptText, shouldEndSession) {
	return {
		outputSpeech: {
			type: "PlainText",
			text: output
		},
		reprompt: {
			outputSpeech: {
				type: "PlainText",
				text: repromptText
			}
		},
		shouldEndSession: shouldEndSession
	}
}

function buildResponse(sessionAttributes, speechletResponse) {
	return {
		version: "1.0",
		sessionAttributes: sessionAttributes,
		response: speechletResponse
	}
}

