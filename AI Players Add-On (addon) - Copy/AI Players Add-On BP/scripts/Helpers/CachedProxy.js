import Main from "Main";
export function createCachedProxy(obj, persistentPropertyMap = new Map()) {
    const cache = new Map(persistentPropertyMap);
    let cacheTick = -1;
    return new Proxy(obj, {
        get (target, prop) {
            if (persistentPropertyMap.has(prop)) return persistentPropertyMap.get(prop);
            if (cacheTick !== Main.currentTick) {
                cache.clear();
                cacheTick = Main.currentTick;
            }
            if (cache.has(prop)) return cache.get(prop);
            const value = target[prop];
            if (typeof value === "function") return value.bind(target);
            cache.set(prop, value);
            return value;
        },
        set (target, prop, value) {
            cache.delete(prop);
            target[prop] = value;
            return true;
        }
    });
}

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIkNhY2hlZFByb3h5LnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBNYWluIGZyb20gXCJNYWluXCI7XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ2FjaGVkUHJveHk8VCBleHRlbmRzIG9iamVjdD4ob2JqOiBULCBwZXJzaXN0ZW50UHJvcGVydHlNYXAgPSBuZXcgTWFwPFByb3BlcnR5S2V5LCB1bmtub3duPigpKTogVCB7XHJcbiAgICBjb25zdCBjYWNoZSA9IG5ldyBNYXAocGVyc2lzdGVudFByb3BlcnR5TWFwKTtcclxuICAgIGxldCBjYWNoZVRpY2sgPSAtMTtcclxuXHJcbiAgICByZXR1cm4gbmV3IFByb3h5PFQ+KG9iaiwge1xyXG4gICAgICAgIGdldCh0YXJnZXQsIHByb3ApIHtcclxuICAgICAgICAgICAgaWYgKHBlcnNpc3RlbnRQcm9wZXJ0eU1hcC5oYXMocHJvcCkpIHJldHVybiBwZXJzaXN0ZW50UHJvcGVydHlNYXAuZ2V0KHByb3ApO1xyXG5cclxuICAgICAgICAgICAgaWYgKGNhY2hlVGljayAhPT0gTWFpbi5jdXJyZW50VGljaykge1xyXG4gICAgICAgICAgICAgICAgY2FjaGUuY2xlYXIoKTtcclxuICAgICAgICAgICAgICAgIGNhY2hlVGljayA9IE1haW4uY3VycmVudFRpY2s7XHJcbiAgICAgICAgICAgIH1cclxuXHJcbiAgICAgICAgICAgIGlmIChjYWNoZS5oYXMocHJvcCkpIHJldHVybiBjYWNoZS5nZXQocHJvcCk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IHRhcmdldFtwcm9wIGFzIGtleW9mIFRdO1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIHZhbHVlID09PSBcImZ1bmN0aW9uXCIpIHJldHVybiB2YWx1ZS5iaW5kKHRhcmdldCk7XHJcblxyXG4gICAgICAgICAgICBjYWNoZS5zZXQocHJvcCwgdmFsdWUpO1xyXG4gICAgICAgICAgICByZXR1cm4gdmFsdWU7XHJcbiAgICAgICAgfSxcclxuICAgICAgICBzZXQodGFyZ2V0LCBwcm9wLCB2YWx1ZSkge1xyXG4gICAgICAgICAgICBjYWNoZS5kZWxldGUocHJvcCk7XHJcbiAgICAgICAgICAgIHRhcmdldFtwcm9wIGFzIGtleW9mIFRdID0gdmFsdWU7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH0sXHJcbiAgICB9KTtcclxufVxyXG4iXSwibmFtZXMiOlsiTWFpbiIsImNyZWF0ZUNhY2hlZFByb3h5Iiwib2JqIiwicGVyc2lzdGVudFByb3BlcnR5TWFwIiwiTWFwIiwiY2FjaGUiLCJjYWNoZVRpY2siLCJQcm94eSIsImdldCIsInRhcmdldCIsInByb3AiLCJoYXMiLCJjdXJyZW50VGljayIsImNsZWFyIiwidmFsdWUiLCJiaW5kIiwic2V0IiwiZGVsZXRlIl0sIm1hcHBpbmdzIjoiQUFBQSxPQUFPQSxVQUFVLE9BQU87QUFFeEIsT0FBTyxTQUFTQyxrQkFBb0NDLEdBQU0sRUFBRUMsd0JBQXdCLElBQUlDLEtBQTJCO0lBQy9HLE1BQU1DLFFBQVEsSUFBSUQsSUFBSUQ7SUFDdEIsSUFBSUcsWUFBWSxDQUFDO0lBRWpCLE9BQU8sSUFBSUMsTUFBU0wsS0FBSztRQUNyQk0sS0FBSUMsTUFBTSxFQUFFQyxJQUFJO1lBQ1osSUFBSVAsc0JBQXNCUSxHQUFHLENBQUNELE9BQU8sT0FBT1Asc0JBQXNCSyxHQUFHLENBQUNFO1lBRXRFLElBQUlKLGNBQWNOLEtBQUtZLFdBQVcsRUFBRTtnQkFDaENQLE1BQU1RLEtBQUs7Z0JBQ1hQLFlBQVlOLEtBQUtZLFdBQVc7WUFDaEM7WUFFQSxJQUFJUCxNQUFNTSxHQUFHLENBQUNELE9BQU8sT0FBT0wsTUFBTUcsR0FBRyxDQUFDRTtZQUV0QyxNQUFNSSxRQUFRTCxNQUFNLENBQUNDLEtBQWdCO1lBQ3JDLElBQUksT0FBT0ksVUFBVSxZQUFZLE9BQU9BLE1BQU1DLElBQUksQ0FBQ047WUFFbkRKLE1BQU1XLEdBQUcsQ0FBQ04sTUFBTUk7WUFDaEIsT0FBT0E7UUFDWDtRQUNBRSxLQUFJUCxNQUFNLEVBQUVDLElBQUksRUFBRUksS0FBSztZQUNuQlQsTUFBTVksTUFBTSxDQUFDUDtZQUNiRCxNQUFNLENBQUNDLEtBQWdCLEdBQUdJO1lBQzFCLE9BQU87UUFDWDtJQUNKO0FBQ0oifQ==