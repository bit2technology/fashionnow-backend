/* global Parse */
/* ERROR CODES: https://parse.com/docs/js/guide#errors */

/*
    ATTENTION: STILL IN DEVELOPMENT!!!
    Used when an user chose to follow another user. This function sets the follow relationship for both users and send a notification to the user that was followed.
    Parameters:
    - userId: User ID of the user to follow
    Push sent:
    - Title: New Follower (P004)
    - Body: <user_display_name> is now following you (P005)
    - follower: User ID of the follower
*/
Parse.Cloud.define('followUser', function (request, response) {

    // Verifying parameters
    if (!request.user) {
        response.error("There is no user making the request, or user is not saved");
    } else if (!request.params.userId) {
        response.error("Parameter missing: userId - User ID of the user to follow");
    }

    // TODO: Set following
});

/*
    Used when an user voted on a poll.
    Parameters:
    - pollId: Id of poll voted
    - vote: one of the options 1 (left), 2 (right) or 0 (skip)
    Return:
    - array containing the Poll and the Vote objects
*/
Parse.Cloud.define("votePoll", function (request, response) {

    // Verifying parameters
    if (!request.user) {
        response.error("There is no user making the request, or user is not saved");
    } else if (!request.params.pollId) {
        response.error("Parameter missing: pollId - Id of poll voted");
    } else if (request.params.vote === undefined) {
        response.error("Parameter missing: vote - one of the options 1 (left), 2 (right) or 0 (skip)");
    } else if (request.params.vote != 1 && request.params.vote != 2 && request.params.vote != 0) {
        response.error("Parameter wrong: vote - is neither 1 (left), 2 (right) or 0 (skip)");
    }
    
    // Get Poll
    new Parse.Query("Poll").get(request.params.pollId, {
        success: function(poll) {
            
            // Verify if user already voted
            new Parse.Query("Vote").equalTo("voteBy", request.user).equalTo("pollId", request.params.pollId).first({
                success: function (equalVote) {
                    
                    if (equalVote) { // Found a vote with this user and this pollId
                        response.error("Error: User already voted");
                    } else {
                        
                        // Create vote
                        var acl = new Parse.ACL();
                        acl.setReadAccess(request.user.id, true);
                        acl.setReadAccess(poll.get("createdBy").id, true);
                        var vote = new Parse.Object("Vote").setACL(acl).set("voteBy", request.user).set("pollId", poll.Id).set("vote", request.params.vote).set("version", 3);
                        // Update poll
                        poll.increment("voteTotalCount");
                        if (request.params.vote > 0) {
                            poll.increment("vote" + request.params.vote + "Count");
                        }
                        // Save
                        Parse.Object.saveAll([poll, vote], {
                            useMasterKey: true,
                            success: function (list) {
                                response.success(list);
                            },
                            error: function (error) {
                                response.error("Save error: " + error.code);
                            }
                        });
                    }
                },
                error: function (error) {
                    response.error("Vote query error: " + error.code);
                }
            });
        },
        error: function(object, error) {
            response.error("Poll query error: " + error.code);
        }
    });  
});

/*
    Used when a poll was posted.
    Parameters:
    - to: Array of user IDs to send a notification about the new poll
    - poll: ID of the new poll
    - caption: Optional description of the poll
    Push sent:
    - Title: New Poll (P001)
    - Body: <user_display_name> needs help (P002) *OR* <user_display_name> needs help: "<poll_caption>" (P003)
    - poll: ID of the new poll
*/
Parse.Cloud.define("pollPosted", function (request, response) {

    // Verifying parameters
    if (!request.user) {
        response.error("There is no user making the request, or user is not saved");
    } else if (!request.params.to) {
        response.error("Parameter missing: to - Array of user IDs to send the notification");
    } else if (!request.params.poll) {
        response.error("Parameter missing: poll - Posted poll ID");
    }

    // Declare localized variables
    var locKey = "P002",
        locArgs = [request.user.get("name") || request.user.get("username")];

    // Change notification style if there is a caption
    if (request.params.caption) {
        locKey = "P003";
        locArgs.push(request.params.caption);
    }

    // Send push notification
    var query = new Parse.Query(Parse.Installation).containedIn("userId", request.params.to).greaterThanOrEqualTo("pushVersion", 1);
    Parse.Push.send({
        where: query,
        data: {
            alert: {
                "title-loc-key": "P001",
                "loc-key": locKey,
                "loc-args": locArgs
            },
            badge: "Increment",
            poll: request.params.poll
        }
    }, {
        success: function () {
            // Push successfull
            response.success("Success");
        },
        error: function (error) {
            // Handle error
            response.error("Error: " + error);
        }
    });
});

/*
    Used to send the e-mail verification code again.
*/
Parse.Cloud.define("resendVerification", function (request, response) {

    // Verifying parameters
    if (!request.user) {
        response.error("There is no user making the request, or user is not saved");
    } else if (!request.user.get("email")) {
        response.error("User has no email");
    }

    // Save with new e-mail then revert. This will send a new verification code.
    var emailBkp = request.user.get("email");
    request.user.save("email", null, {
        success: function () {
            // First save successful
            request.user.save("email", emailBkp, {
                success: function () {
                    // Second save successful
                    response.success("Success");
                },
                error: function (error) {
                    // Handle error
                    response.error("Error Save 2: " + error);
                }
            });
        },
        error: function (error) {
            // Handle error
            response.error("Error Save 1: " + error);
        }
    });
});

/*
    Used to return the location of devices with the app installed.
    Returns:
    - Array of Installation (with only the location field)
*/
Parse.Cloud.define("deviceLocations", function (request, response) {

    // Verifying parameters
    if (!request.user) {
        response.error("There is no user making the request, or user is not saved");
    } else if (!request.user.get("admin")) {
        response.error("User making the request is not an administrator");
    }

    var query = new Parse.Query(Parse.Installation).select("location").exists("location").limit(1000);
    query.find({
        useMasterKey: true,
        success: function (results) {
            response.success(results);
        },
        error: function (error) {
            response.error(error);
        }
    });
});

/*
    Used to automatically set the facebookId for the user when it logs with Facebook and the search field
*/
Parse.Cloud.beforeSave(Parse.User, function (request, response) {

    // Get Facebook authorization info
    var auth = request.object.get("authData"),
        facebookAuth = auth ? auth.facebook : null;
    // Update facebookId
    request.object.set("facebookId", facebookAuth ? facebookAuth.id : null);

    request.object.set("search", ((request.object.get("name") || "") + " " + (request.object.get("username") || "") + " " + (request.object.get("email") || "")).toLowerCase());

    response.success();
});

// ##################################################################### BACKGROUND JOBS #####################################################################

/*
    Used set the search field of all users.
*/
Parse.Cloud.job("makeUsersSearchable", function (request, status) {
    // Set up to modify user data
    Parse.Cloud.useMasterKey();
    // Query for all users
    var query = new Parse.Query(Parse.User).doesNotExist("search");
    query.each(function(user) {
        // Set and save the change
        user.set("search", (user.get("name") || "").toLowerCase() + " " + (user.get("username") || "").toLowerCase() + " " + (user.get("email") || "").toLowerCase());
        return user.save();
    }).then(function() {
        // Set the job's success status
        status.success("Migration completed successfully.");
    }, function(error) {
        // Set the job's error status
        status.error("Uh oh, something went wrong.");
    });
});

// ##################################################################### DEPRECATED - AVOID USING THESE FUNCTIONS #####################################################################

Parse.Cloud.define("sendPush", function (request, response) {

    var query = new Parse.Query(Parse.Installation),
        locKey = "P002",
        locArgs = [request.params.from];

    // Change notification style if there is a caption
    if (request.params.caption) {
        locKey = "P003";
        locArgs.push(request.params.caption);
    }

    query.containedIn("userId", request.params.to)
         .greaterThanOrEqualTo("pushVersion", 1);

    Parse.Push.send({
        where: query,
        data: {
            alert: {
                "title-loc-key": "P001",
                "loc-key": locKey,
                "loc-args": locArgs
            },
            badge: "Increment",
            poll: request.params.poll
        }
    }, {
        success: function () {
            // Push successfull
            response.success("sendPush successful");
        },
        error: function (error) {
            // Handle error
            response.error("sendPush error: " + error);
        }
    });
});