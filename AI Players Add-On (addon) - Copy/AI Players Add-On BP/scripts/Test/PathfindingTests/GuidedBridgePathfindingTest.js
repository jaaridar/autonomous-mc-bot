import V3 from "Helpers/Vectors/V3";
import AbstractPathfindingTest from "./AbstractPathfindingTest";
class GuidedBridgePathfindingTest extends AbstractPathfindingTest {
    constructor(...args){
        super(...args);
        this.identifier = "guided_bridge";
        this.entityLocation = new V3(13, 13, 7);
        this.primaryLocation = new V3(1, 13, 7);
        this.secondaryLocations = [
            new V3(10, 13, 13),
            new V3(9, 13, 13),
            new V3(8, 13, 13),
            new V3(7, 13, 13),
            new V3(6, 13, 13),
            new V3(5, 13, 13),
            new V3(4, 13, 13)
        ];
    }
}
export { GuidedBridgePathfindingTest as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkd1aWRlZEJyaWRnZVBhdGhmaW5kaW5nVGVzdC50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgVjMgZnJvbSBcIkhlbHBlcnMvVmVjdG9ycy9WM1wiO1xyXG5pbXBvcnQgQWJzdHJhY3RQYXRoZmluZGluZ1Rlc3QgZnJvbSBcIi4vQWJzdHJhY3RQYXRoZmluZGluZ1Rlc3RcIjtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEd1aWRlZEJyaWRnZVBhdGhmaW5kaW5nVGVzdCBleHRlbmRzIEFic3RyYWN0UGF0aGZpbmRpbmdUZXN0IHtcclxuICAgIHB1YmxpYyByZWFkb25seSBpZGVudGlmaWVyID0gXCJndWlkZWRfYnJpZGdlXCI7XHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgZW50aXR5TG9jYXRpb246IFYzID0gbmV3IFYzKDEzLCAxMywgNyk7XHJcbiAgICBwcm90ZWN0ZWQgcmVhZG9ubHkgcHJpbWFyeUxvY2F0aW9uOiBWMyA9IG5ldyBWMygxLCAxMywgNyk7XHJcblxyXG4gICAgcHJvdGVjdGVkIHJlYWRvbmx5IHNlY29uZGFyeUxvY2F0aW9uczogVjNbXSA9IFtcclxuICAgICAgICBuZXcgVjMoMTAsIDEzLCAxMyksXHJcbiAgICAgICAgbmV3IFYzKDksIDEzLCAxMyksXHJcbiAgICAgICAgbmV3IFYzKDgsIDEzLCAxMyksXHJcbiAgICAgICAgbmV3IFYzKDcsIDEzLCAxMyksXHJcbiAgICAgICAgbmV3IFYzKDYsIDEzLCAxMyksXHJcbiAgICAgICAgbmV3IFYzKDUsIDEzLCAxMyksXHJcbiAgICAgICAgbmV3IFYzKDQsIDEzLCAxMyksXHJcbiAgICBdO1xyXG59XHJcbiJdLCJuYW1lcyI6WyJWMyIsIkFic3RyYWN0UGF0aGZpbmRpbmdUZXN0IiwiR3VpZGVkQnJpZGdlUGF0aGZpbmRpbmdUZXN0IiwiaWRlbnRpZmllciIsImVudGl0eUxvY2F0aW9uIiwicHJpbWFyeUxvY2F0aW9uIiwic2Vjb25kYXJ5TG9jYXRpb25zIl0sIm1hcHBpbmdzIjoiQUFBQSxPQUFPQSxRQUFRLHFCQUFxQjtBQUNwQyxPQUFPQyw2QkFBNkIsNEJBQTRCO0FBRWpELE1BQU1DLG9DQUFvQ0Q7OzthQUNyQ0UsYUFBYTthQUNWQyxpQkFBcUIsSUFBSUosR0FBRyxJQUFJLElBQUk7YUFDcENLLGtCQUFzQixJQUFJTCxHQUFHLEdBQUcsSUFBSTthQUVwQ00scUJBQTJCO1lBQzFDLElBQUlOLEdBQUcsSUFBSSxJQUFJO1lBQ2YsSUFBSUEsR0FBRyxHQUFHLElBQUk7WUFDZCxJQUFJQSxHQUFHLEdBQUcsSUFBSTtZQUNkLElBQUlBLEdBQUcsR0FBRyxJQUFJO1lBQ2QsSUFBSUEsR0FBRyxHQUFHLElBQUk7WUFDZCxJQUFJQSxHQUFHLEdBQUcsSUFBSTtZQUNkLElBQUlBLEdBQUcsR0FBRyxJQUFJO1NBQ2pCOztBQUNMO0FBZEEsU0FBcUJFLHlDQWNwQiJ9