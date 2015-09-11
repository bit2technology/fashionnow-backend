/* global Parse */
/* ERROR CODES: https://parse.com/docs/js/guide#errors */

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