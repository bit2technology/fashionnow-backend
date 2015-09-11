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
    Used to return the location of devices with the app installed. Installation object needs the location field.
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
    Used to make canonical search of users.
    Parameters:
    - query: string to search for.
    Returns:
    - Array of Users
*/
Parse.Cloud.define("searchUsers", function (request, response) {

    // Verifying parameters
    if (!request.params.query) {
        response.error("There is no string to search for");
    }

    var query = new Parse.Query(Parse.User).contains("search", removeDiacritics(request.params.query).toLowerCase()).descending("followers");
    if (request.user) {
        query.notEqualTo("id", request.user.id);
    }
    query.find({
        success: function (results) {
            response.success(results);
        },
        error: function (error) {
            response.error(error);
        }
    });
});

/*
    Used to get user recomendations.
    Returns:
    - Array of Users
*/
Parse.Cloud.define("trendingUsers", function (request, response) {

    var query = new Parse.Query(Parse.User).exists("search").descending("followers");
    if (request.user) {
        query.notEqualTo("id", request.user.id);
    }
    query.find({
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
    var auth = request.object.get("authData");
    var facebookAuth = auth ? auth.facebook : null;
    // Update facebookId
    request.object.set("facebookId", facebookAuth ? facebookAuth.id : null);
    
    // Set canonical search field if user is not anonymous
    var anonymous = auth ? auth.anonymous : null;
    if (anonymous) {
        request.object.unset("search");
    } else {
        request.object.set("search", searchField(request.object));
    }
    
    // Set display name
    if (request.object.get("name")) {
        request.object.set("displayName", request.object.get("name"));
    } else if (request.object.get("hasPassword")) {
        request.object.set("displayName", request.object.get("username"));
    } else {
        request.object.unset("displayName");
    }

    response.success();
});

// ##################################################################### BACKGROUND JOBS #####################################################################

/*
    Get missing info from Facebook. This will also trigger the before_save for each user.
*/
Parse.Cloud.job("fixUsers", function (request, status) {
    // Set up to modify user data
    Parse.Cloud.useMasterKey();
    // Query for all users
    var query = new Parse.Query(Parse.User);
    query.each(function(user) {
        // Get missing info from Facebook
        var auth = user.get("authData");
        var facebookAuth = auth ? auth.facebook : null;
        if (facebookAuth && facebookAuth.access_token && !user.get("email")) {
            var url = "https://graph.facebook.com/me?access_token=" + facebookAuth.access_token;
            Parse.Cloud.httpRequest({
                url: url,
                success: function(httpResponse) {
                    var facebookUser = JSON.parse(httpResponse.text);
                    if (!user.get("name")) {
                        user.set("name", facebookUser.first_name);
                    }
                    if (!user.get("gender")) {
                        user.set("gender", facebookUser.gender);
                    }
                    user.save();
                    if (!user.get("email")) {
                        user.set("email", facebookUser.email);
                    }
                    return user.save();
                },
                error: function(httpResponse) {
                    console.error('Facebook request error: ' + httpResponse.status + " " + JSON.parse(httpResponse.text).error.message);
                    return user.save();
                }
            });
        } else {
            return user.save();
        }
    }).then(function() {
        // Set the job's success status
        status.success("Migration completed successfully.");
    }, function(error) {
        // Set the job's error status
        status.error("Uh oh, something went wrong: " + error.code);
    });
});

// ##################################################################### HELPER FUNCTIONS #####################################################################

var removeDiacritics = require('cloud/diacritics').remove;

function searchField (user) {
    return removeDiacritics((user.get("name") || "") + " " + (user.get("username") || "") + " " + (user.get("email") || "") + " " + (user.get("location") || "")).toLowerCase();
}

// ##################################################################### IN DEVELOPMENT #####################################################################

/*
    Used to block unwanted users. Only affects the user making the request.
    Parameters:
    - userId: Id of user to block. Attention: this field won't be checked! The developer must provide a valid user ID on its own.
*/
Parse.Cloud.define("blockUser", function (request, response) {

    // Verifying parameters
    if (!request.user) {
        response.error("There is no user making the request, or user is not saved");
    } else if (!request.params.userId) {
       response.error("Parameter missing: userId - Id of user to block");
    }
    
    // Create and save block info
    var acl = new Parse.ACL(request.user);
    var block = new Parse.Object("Block").setACL(acl).set("user", request.user).set("blocked", Parse.User.createWithoutData(request.params.userId));
    block.save({
        success: function (block) {
            response.success(true);
        },
        error: function (error) {
            response.error("Save error: " + error.code);
        }
    });
});

/*
    Used when an user chose to follow another user. This function sets the follow relationship for both users and send a notification to the user that was followed.
    Parameters:
    - userId: User ID of the user to follow
    Push sent (if not mutual):
    - Title: New Follower (P004)
    - Body: <user_display_name> is now following you (P005)
    - userId: User ID of the follower
    Push sent (if mutual):
    - Title: New Friend (P006)
    - Body: Congratulations! You and <user_display_name> became friends. (P007)
    - userId: User ID of the follower
*/
Parse.Cloud.define('followUser', function (request, response) {
    Parse.Cloud.useMasterKey();

    // Verifying parameters
    if (!request.user) {
        response.error("There is no user making the request, or user is not saved");
    } else if (!request.params.userId) {
        response.error("Parameter missing: userId - User ID of the user to follow");
    } else if (request.params.userId == request.user.id) {
        response.error("Parameter wrong: userId - User cannot follow itself");
    }
    var auth = request.user ? request.user.get("authData") : null;
    var anonymous = auth ? auth.anonymous : null;
    if (anonymous) {
        response.error("The user making the request cannot be anonymous");
    }

    // Get user to follow
    new Parse.Query(Parse.User).include("authData").get(request.params.userId, {
        success: function(userToFollow) {
            var followingAuth = userToFollow.get("authData");
            var followingAnon = followingAuth ? followingAuth.anonymous : null;
            if (followingAnon) {
                response.error("The user to follow cannot be anonymous");
            }
            
            // Verify if is already following
            new Parse.Query("Follow").equalTo("follower", request.user).equalTo("user", userToFollow).first({
                success: function (alreadyFollow) {
                    
                    if (alreadyFollow) { // User is already following
                        response.error("Error: User is already following");
                    } else {
                        
                        // Verify if it is mutual
                        new Parse.Query("Follow").equalTo("follower", userToFollow).equalTo("user", request.user).first({
                            success: function (mutualFollow) {
                                
                                // Create follow
                                var acl = new Parse.ACL(request.user);
                                acl.setPublicReadAccess(true);
                                var follow = new Parse.Object("Follow").setACL(acl).set("follower", request.user).set("user", userToFollow);
                                var objectsToSave = [follow, request.user, userToFollow];
                                // Update users
                                request.user.increment("following");
                                userToFollow.increment("followers");
                                if (mutualFollow) { // User to follow is already following the new follower - Mark them friends
                                    follow.set("mutual", true);
                                    mutualFollow.set("mutual", true);
                                    objectsToSave.push(mutualFollow);
                                    request.user.increment("friends");
                                    userToFollow.increment("friends");
                                }
                                // Save
                                Parse.Object.saveAll(objectsToSave, {
                                    success: function (list) {
                                        
                                        // Send push
                                        var locTitle = "P004";
                                        var locKey = "P005";
                                        var locArgs = [request.user.get("name") || request.user.get("username")];
                                        if (mutualFollow) {
                                            locTitle = "P006";
                                            locKey = "P007";
                                        }
                                        
                                        Parse.Push.send({
                                            where: new Parse.Query(Parse.Installation).equalTo("userId", userToFollow.id).greaterThanOrEqualTo("pushVersion", 2),
                                            data: {
                                                alert: {
                                                    "title-loc-key": locTitle,
                                                    "loc-key": locKey,
                                                    "loc-args": locArgs
                                                },
                                                badge: "Increment",
                                                userId: request.user.id
                                            }
                                        });
                                        
                                        response.success([request.user, userToFollow]);
                                    },
                                    error: function (error) {
                                        response.error("Save error: " + error.code);
                                    }
                                }); 
                            },
                            error: function (error) {
                                response.error("Mutual follow query error: " + error.code);
                            }
                        });
                    }
                },
                error: function (error) {
                    response.error("Already follow query error: " + error.code);
                }
            });
        },
        error: function(object, error) {
            response.error("User query error: " + error.code);
        }
    });  
});

/*
    Used when an user chose to unfollow another user. This function sets the follow relationship for both users.
    Parameters:
    - userId: User ID of the user to unfollow
*/
Parse.Cloud.define('unfollowUser', function (request, response) {
    Parse.Cloud.useMasterKey();

    // Verifying parameters
    if (!request.user) {
        response.error("There is no user making the request, or user is not saved");
    } else if (!request.params.userId) {
        response.error("Parameter missing: userId - User ID of the user to unfollow");
    } else if (request.params.userId == request.user.id) {
        response.error("Parameter wrong: userId - User cannot unfollow itself");
    }

    // Get user to unfollow
    new Parse.Query(Parse.User).get(request.params.userId, {
        success: function(userToUnfollow) {
            
            // Verify if is already following
            new Parse.Query("Follow").equalTo("follower", request.user).equalTo("user", userToUnfollow).first({
                success: function (alreadyFollow) {
                    
                    if (!alreadyFollow) { // User is not following
                        response.error("Error: User is not following");
                    } else {
                        
                        // Verify if it is mutual
                        new Parse.Query("Follow").equalTo("follower", userToUnfollow).equalTo("user", request.user).first({
                            success: function (mutualFollow) {
                                
                                var objectsToSave = [request.user, userToUnfollow];
                                // Update users
                                request.user.increment("following", -1);
                                userToUnfollow.increment("followers", -1);
                                if (mutualFollow) { // User to unfollow is following the user making the request - Undo friendship
                                    mutualFollow.set("mutual", false);
                                    objectsToSave.push(mutualFollow);
                                    request.user.increment("friends", -1);
                                    userToUnfollow.increment("friends", -1);
                                }
                                // Save
                                Parse.Object.saveAll(objectsToSave, {
                                    success: function (list) {
                                        
                                        alreadyFollow.destroy({
                                            success: function (list) {
                                                response.success([request.user, userToUnfollow]);
                                            },
                                            error: function (error) {
                                                response.error("Destroy error: " + error.code);
                                            }
                                        });
                                    },
                                    error: function (error) {
                                        response.error("Save error: " + error.code);
                                    }
                                }); 
                            },
                            error: function (error) {
                                response.error("Mutual follow query error: " + error.code);
                            }
                        });
                    }
                },
                error: function (error) {
                    response.error("Already follow query error: " + error.code);
                }
            });
        },
        error: function(object, error) {
            response.error("User query error: " + error.code);
        }
    });  
});

/*
    Used to check if the current user is following this user.
    Parameters:
    - userId: User ID of the user to check follow status
*/
Parse.Cloud.define('isFollowing', function (request, response) {

    // Verifying parameters
    if (!request.user) {
        response.error("There is no user making the request, or user is not saved");
    } else if (!request.params.userId) {
        response.error("Parameter missing: userId - User ID of the user to unfollow");
    } else if (request.params.userId == request.user.id) {
        response.error("Parameter wrong: userId - User cannot (un)follow itself");
    }

    // Get user to unfollow
    new Parse.Query(Parse.User).get(request.params.userId, {
        success: function(userToUnfollow) {
            
            // Verify if is already following
            new Parse.Query("Follow").equalTo("follower", request.user).equalTo("user", userToUnfollow).first({
                success: function (alreadyFollow) {
                    response.success(alreadyFollow ? true : false);
                },
                error: function (error) {
                    response.error("Already follow query error: " + error.code);
                }
            });
        },
        error: function(object, error) {
            response.error("User query error: " + error.code);
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

// ##################################################################### DEPRECATED - AVOID USING THESE FUNCTIONS #####################################################################

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