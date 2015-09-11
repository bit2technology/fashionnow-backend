/* global Parse */
/* ERROR CODES: https://parse.com/docs/js/guide#errors */

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

var removeDiacritics = require('cloud/diacritics').remove;
function searchField (user) {
    return removeDiacritics((user.get("name") || "") + " " + (user.get("username") || "") + " " + (user.get("email") || "") + " " + (user.get("location") || "")).toLowerCase();
}