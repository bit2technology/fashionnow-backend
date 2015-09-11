/* global Parse */
/* ERROR CODES: https://parse.com/docs/js/guide#errors */

/*
    Used to report unwanted polls. The poll will be unavailable to ALL users!
    Parameters:
    - pollId: Id of poll the user wants to report
    - comment (optional): Reason of why the user wants to report this poll
    Push sent:
    - Title: New Poll Report (P008)
    - Body: A poll was reported (P009)
    - pollId: Poll ID of the follower
*/
Parse.Cloud.define("reportPoll", function (request, response) {

    // Verifying parameters
    if (!request.user) {
        response.error("There is no user making the request, or user is not saved");
    } else if (!request.params.pollId) {
       response.error("Parameter missing: pollId - Id of poll voted");
    }
    
    // Get poll
    new Parse.Query("Poll").get(request.params.pollId, {
        success: function(poll) {
            
            // Create report
            var acl = new Parse.ACL();
            acl.setReadAccess(request.user.id, true);
            var report = new Parse.Object("Report").setACL(acl).set("user", request.user).set("poll", poll).set("comment", request.params.comment);
            // Update poll
            poll.set("hidden", true);
            // Save
            Parse.Object.saveAll([poll, report], {
                useMasterKey: true,
                success: function (list) {
                    
                    Parse.Push.send({
                        channels: ["report"],
                        data: {
                            alert: {
                                "title-loc-key": "P008",
                                "loc-key": "P009"
                            },
                            badge: "Increment",
                            pollId: poll.id
                        }
                    });
                    
                    response.success(true);
                },
                error: function (error) {
                    response.error("Save error: " + error.code);
                }
            });
        },
        error: function(object, error) {
            response.error("Poll query error: " + error.code);
        }
    });
});

/*
    Used when an user voted on a poll.
    Parameters:
    - pollId: Id of poll voted
    - vote: one of the options 1 (left), 2 (right) or 0 (skip)
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
    
    // Get poll
    new Parse.Query("Poll").get(request.params.pollId, {
        success: function(poll) {
            
            // Verify if user already voted
            new Parse.Query("Vote").equalTo("voteBy", request.user).equalTo("pollId", poll.id).first({
                success: function (equalVote) {
                    
                    if (equalVote) { // Found a vote with this user and this pollId
                        response.error("Error: User already voted");
                    } else {
                        
                        // Create vote
                        var acl = new Parse.ACL();
                        acl.setReadAccess(request.user.id, true);
                        acl.setReadAccess(poll.get("createdBy").id, true);
                        var vote = new Parse.Object("Vote").setACL(acl).set("voteBy", request.user).set("pollId", poll.id).set("vote", request.params.vote).set("version", 3);
                        // Update poll
                        poll.increment("voteTotalCount");
                        if (request.params.vote > 0) {
                            poll.increment("vote" + request.params.vote + "Count");
                        }
                        // Save
                        Parse.Object.saveAll([poll, vote], {
                            useMasterKey: true,
                            success: function (list) {
                                response.success(true);
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
    Used when a user wants to post a poll.
    Parameters:
    - to: Array of user IDs that will be able to see and vote, also send a notification about the new poll
    - leftId: ID of the left photo. Attention: this field won't be checked! The developer must provide a valid photo ID on its own.
    - rightId: ID of the right photo. Attention: this field won't be checked! The developer must provide a valid photo ID on its own.
    - caption (optional): description of the poll
    Push sent:
    - Title: New Poll (P001)
    - Body: <user_display_name> needs help (P002) *OR* <user_display_name> needs help: "<poll_caption>" (P003)
    - poll: ID of the new poll
*/
Parse.Cloud.define("postPoll", function (request, response) {

    // Verifying parameters
    if (!request.user) {
        response.error("There is no user making the request, or user is not saved");
    } else if (!request.user.get("emailVerified") && !request.user.get("facebookId")) {
        response.error("The user has not verified email or Facebook account");
    } else if (!request.params.to) {
        response.error("Parameter missing: to - Array of user IDs to send the notification");
    } else if (!request.params.leftId) {
        response.error("Parameter missing: leftId - ID of the left photo");
    } else if (!request.params.rightId) {
        response.error("Parameter missing: rightId - ID of the right photo");
    }
    
    var ParsePhoto = Parse.Object.extend("Photo");

    // // Declare localized variables
    // var locKey = "P002",
    //     locArgs = [request.user.get("name") || request.user.get("username")];

    // // Change notification style if there is a caption
    // if (request.params.caption) {
    //     locKey = "P003";
    //     locArgs.push(request.params.caption);
    // }

    // // Send push notification
    // var query = new Parse.Query(Parse.Installation).containedIn("userId", request.params.to).greaterThanOrEqualTo("pushVersion", 1);
    // Parse.Push.send({
    //     where: query,
    //     data: {
    //         alert: {
    //             "title-loc-key": "P001",
    //             "loc-key": locKey,
    //             "loc-args": locArgs
    //         },
    //         badge: "Increment",
    //         poll: request.params.poll
    //     }
    // }, {
    //     success: function () {
    //         // Push successfull
    //         response.success("Success");
    //     },
    //     error: function (error) {
    //         // Handle error
    //         response.error("Error: " + error);
    //     }
    // });
});
