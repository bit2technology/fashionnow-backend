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
    } else if (request.params.vote !== 1 && request.params.vote !== 2 && request.params.vote !== 0) {
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
                                response.success(poll);
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
    Used to inform that the user finished all polls to vote.
*/
Parse.Cloud.define("finishedVoting", function (request, response) {

    // Verifying parameters
    if (!request.user) {
        response.error("There is no user making the request, or user is not saved");
    }

    request.user.set("finishedVoting", true).save({
        success: function (user) {
            response.success(true);
        },
        error: function (error) {
            response.error("Save error: " + error.code);
        }
    });
});

/*
    Used when a user wants to post a poll.
    Parameters:
    - to (optional): Array of user IDs that will be able to see and vote, also send a notification about the new poll. If this param is not set, the poll will be public.
    - leftId: ID of the left photo. Attention: this field won't be checked! The developer must provide a valid photo ID on its own.
    - rightId: ID of the right photo. Attention: this field won't be checked! The developer must provide a valid photo ID on its own.
    - caption (optional): description of the poll.
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
    } else if (!request.params.leftId) {
        response.error("Parameter missing: leftId - ID of the left photo");
    } else if (!request.params.rightId) {
        response.error("Parameter missing: rightId - ID of the right photo");
    }

    var acl = new Parse.ACL(request.user);
    if (request.params.to) {
        for (var i = 0; i < request.params.to.length; i++) {
            acl.setReadAccess(request.params.to[i], true);
        }
    } else {
        acl.setPublicReadAccess(true);
    }

    var ParsePhoto = Parse.Object.extend("Photo");
    var photos = [ParsePhoto.createWithoutData(request.params.leftId), ParsePhoto.createWithoutData(request.params.rightId)];
    for (var j = 0; j < photos.length; j++) {
        photos[j].setACL(new Parse.ACL(request.user).setPublicReadAccess(true));
    }

    var locKey = "P002";
    var locArgs = [request.user.get("displayName")];

    var poll = new Parse.Object("Poll").setACL(acl).set("createdBy", request.user).set("photos", photos).set("version", 2);
    if (request.params.caption) {
        poll.set("caption", request.params.caption);
        locKey = "P003";
        locArgs.push(request.params.caption);
    }
    if (request.params.to) {
        poll.set("userIds", request.params.to);
    }

    poll.save({
        success: function(poll) {

            new Parse.Query("Follow").include("follower").equalTo("user", request.user).find({
                success: function(followersFollows) {

                    var followers = [];
                    for (var i = 0; i < followersFollows.length; i++) {
                        followers.push(followersFollows[i].get("follower").id);
                    }
                    request.params.to.concat(followers);

                    Parse.Push.send({
                        where: new Parse.Query(Parse.Installation).containedIn("userId", request.params.to).greaterThanOrEqualTo("pushVersion", 1),
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
                            response.success(poll);
                        },
                        error: function (error) {
                            // Handle error
                            console.error("Push send error: " + error.code);
                            response.success(poll);
                        }
                    });
                },
                error: function(error) {
                    response.error("Followers error " + error.code);
                }
            });
        },
        error: function(poll, error) {
            response.error("Poll save error " + error.code);
        }
    });
});
