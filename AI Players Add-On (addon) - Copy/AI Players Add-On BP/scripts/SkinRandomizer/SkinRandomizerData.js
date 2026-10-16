class SkinRandomizerData {
}
// How many texture options there are for each category
SkinRandomizerData.OptionCounts = {
    BodyType: 8,
    Pants: 40,
    Shirt: 90,
    Hair: 129,
    EyeColor: 34
};
SkinRandomizerData.PresetOutfitChance = 0.1 // Chance that the entire skin will be a special preset outfit, bypassing all other randomization
;
// Texture index ranges for the base skin layer
SkinRandomizerData.BaseSkin = {
    // Special base skins are the unnatural (ex. red, blue) skin tones
    ChanceForSpecialBaseSkin: 0.05,
    NormalBaseSkinRange: {
        min: 0,
        max: 19
    },
    SpecialBaseSkinRange: {
        min: 19,
        max: 34
    },
    PresetOutfitsRange: {
        min: 40,
        max: 60
    }
};
// Skin tone thresholds used when choosing mouth, hair colour ranges
SkinRandomizerData.SkinToneThresholds = {
    LightMax: 8,
    MediumMax: 19
};
// Texture index ranges and special chance for the eyes layer
SkinRandomizerData.Eyes = {
    ChanceForSpecialEyes: 0.125,
    NormalEyesRange: {
        min: 0,
        max: 38
    },
    SpecialEyesRange: {
        min: 38,
        max: 52
    }
};
// Texture index ranges and special chance for the mouth layer
SkinRandomizerData.Mouth = {
    ChanceForSpecialMouth: 0.375,
    NormalMouthRange: {
        min: 0,
        max: 10
    },
    SpecialMouthRange: {
        min: 10,
        max: 29
    }
};
// Weighted texture ranges for the mouth colour layer, per skin tone category
SkinRandomizerData.MouthColor = {
    LightSkin: {
        ChanceForSpecialMouthColor: 0.25,
        NormalMouthColorRange: {
            min: 0,
            max: 9
        },
        SpecialMouthColorRange: {
            min: 9,
            max: 17
        }
    },
    MediumSkin: {
        Range: {
            min: 11,
            max: 16
        }
    },
    DarkSkin: {
        ChanceForSpecialMouthColor: 0.25,
        NormalMouthColorRange: {
            min: 0,
            max: 17
        },
        SpecialMouthColorRange: {
            min: 17,
            max: 30
        }
    }
};
// Weighted texture ranges for the hair colour layer, per skin tone category
SkinRandomizerData.HairColor = {
    LightSkin: {
        ChanceForSpecialHairColor: 0.25,
        NormalHairColorRange: {
            min: 0,
            max: 13
        },
        SpecialHairColorRange: {
            min: 13,
            max: 36
        }
    },
    MediumSkin: {
        Weights: {
            Matching: 75,
            Lighter: 12.5,
            Darker: 12.5
        },
        Ranges: {
            Matching: {
                min: 13,
                max: 23
            },
            Lighter: {
                min: 0,
                max: 13
            },
            Darker: {
                min: 23,
                max: 36
            }
        }
    },
    DarkSkin: {
        ChanceForSpecialHairColor: 0.25,
        NormalHairColorRange: {
            min: 0,
            max: 23
        },
        SpecialHairColorRange: {
            min: 23,
            max: 36
        }
    }
};
export { SkinRandomizerData as default };

//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIlNraW5SYW5kb21pemVyRGF0YS50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZGVmYXVsdCBjbGFzcyBTa2luUmFuZG9taXplckRhdGEge1xyXG4gICAgLy8gSG93IG1hbnkgdGV4dHVyZSBvcHRpb25zIHRoZXJlIGFyZSBmb3IgZWFjaCBjYXRlZ29yeVxyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBPcHRpb25Db3VudHMgPSB7XHJcbiAgICAgICAgQm9keVR5cGU6IDgsXHJcbiAgICAgICAgUGFudHM6IDQwLFxyXG4gICAgICAgIFNoaXJ0OiA5MCxcclxuICAgICAgICBIYWlyOiAxMjksXHJcbiAgICAgICAgRXllQ29sb3I6IDM0LFxyXG4gICAgfTtcclxuXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IFByZXNldE91dGZpdENoYW5jZSA9IDAuMTsgLy8gQ2hhbmNlIHRoYXQgdGhlIGVudGlyZSBza2luIHdpbGwgYmUgYSBzcGVjaWFsIHByZXNldCBvdXRmaXQsIGJ5cGFzc2luZyBhbGwgb3RoZXIgcmFuZG9taXphdGlvblxyXG5cclxuICAgIC8vIFRleHR1cmUgaW5kZXggcmFuZ2VzIGZvciB0aGUgYmFzZSBza2luIGxheWVyXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IEJhc2VTa2luID0ge1xyXG4gICAgICAgIC8vIFNwZWNpYWwgYmFzZSBza2lucyBhcmUgdGhlIHVubmF0dXJhbCAoZXguIHJlZCwgYmx1ZSkgc2tpbiB0b25lc1xyXG4gICAgICAgIENoYW5jZUZvclNwZWNpYWxCYXNlU2tpbjogMC4wNSxcclxuICAgICAgICBOb3JtYWxCYXNlU2tpblJhbmdlOiB7IG1pbjogMCwgbWF4OiAxOSB9LFxyXG4gICAgICAgIFNwZWNpYWxCYXNlU2tpblJhbmdlOiB7IG1pbjogMTksIG1heDogMzQgfSxcclxuICAgICAgICBQcmVzZXRPdXRmaXRzUmFuZ2U6IHsgbWluOiA0MCwgbWF4OiA2MCB9LFxyXG4gICAgfTtcclxuXHJcbiAgICAvLyBTa2luIHRvbmUgdGhyZXNob2xkcyB1c2VkIHdoZW4gY2hvb3NpbmcgbW91dGgsIGhhaXIgY29sb3VyIHJhbmdlc1xyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBTa2luVG9uZVRocmVzaG9sZHMgPSB7XHJcbiAgICAgICAgTGlnaHRNYXg6IDgsXHJcbiAgICAgICAgTWVkaXVtTWF4OiAxOSxcclxuICAgIH07XHJcblxyXG4gICAgLy8gVGV4dHVyZSBpbmRleCByYW5nZXMgYW5kIHNwZWNpYWwgY2hhbmNlIGZvciB0aGUgZXllcyBsYXllclxyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBFeWVzID0ge1xyXG4gICAgICAgIENoYW5jZUZvclNwZWNpYWxFeWVzOiAwLjEyNSxcclxuICAgICAgICBOb3JtYWxFeWVzUmFuZ2U6IHsgbWluOiAwLCBtYXg6IDM4IH0sXHJcbiAgICAgICAgU3BlY2lhbEV5ZXNSYW5nZTogeyBtaW46IDM4LCBtYXg6IDUyIH0sXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIFRleHR1cmUgaW5kZXggcmFuZ2VzIGFuZCBzcGVjaWFsIGNoYW5jZSBmb3IgdGhlIG1vdXRoIGxheWVyXHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IE1vdXRoID0ge1xyXG4gICAgICAgIENoYW5jZUZvclNwZWNpYWxNb3V0aDogMC4zNzUsXHJcbiAgICAgICAgTm9ybWFsTW91dGhSYW5nZTogeyBtaW46IDAsIG1heDogMTAgfSxcclxuICAgICAgICBTcGVjaWFsTW91dGhSYW5nZTogeyBtaW46IDEwLCBtYXg6IDI5IH0sXHJcbiAgICB9O1xyXG5cclxuICAgIC8vIFdlaWdodGVkIHRleHR1cmUgcmFuZ2VzIGZvciB0aGUgbW91dGggY29sb3VyIGxheWVyLCBwZXIgc2tpbiB0b25lIGNhdGVnb3J5XHJcbiAgICBwdWJsaWMgc3RhdGljIHJlYWRvbmx5IE1vdXRoQ29sb3IgPSB7XHJcbiAgICAgICAgTGlnaHRTa2luOiB7XHJcbiAgICAgICAgICAgIENoYW5jZUZvclNwZWNpYWxNb3V0aENvbG9yOiAwLjI1LFxyXG4gICAgICAgICAgICBOb3JtYWxNb3V0aENvbG9yUmFuZ2U6IHsgbWluOiAwLCBtYXg6IDkgfSxcclxuICAgICAgICAgICAgU3BlY2lhbE1vdXRoQ29sb3JSYW5nZTogeyBtaW46IDksIG1heDogMTcgfSxcclxuICAgICAgICB9LFxyXG4gICAgICAgIE1lZGl1bVNraW46IHtcclxuICAgICAgICAgICAgUmFuZ2U6IHsgbWluOiAxMSwgbWF4OiAxNiB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgRGFya1NraW46IHtcclxuICAgICAgICAgICAgQ2hhbmNlRm9yU3BlY2lhbE1vdXRoQ29sb3I6IDAuMjUsXHJcbiAgICAgICAgICAgIE5vcm1hbE1vdXRoQ29sb3JSYW5nZTogeyBtaW46IDAsIG1heDogMTcgfSxcclxuICAgICAgICAgICAgU3BlY2lhbE1vdXRoQ29sb3JSYW5nZTogeyBtaW46IDE3LCBtYXg6IDMwIH0sXHJcbiAgICAgICAgfSxcclxuICAgIH07XHJcblxyXG4gICAgLy8gV2VpZ2h0ZWQgdGV4dHVyZSByYW5nZXMgZm9yIHRoZSBoYWlyIGNvbG91ciBsYXllciwgcGVyIHNraW4gdG9uZSBjYXRlZ29yeVxyXG4gICAgcHVibGljIHN0YXRpYyByZWFkb25seSBIYWlyQ29sb3IgPSB7XHJcbiAgICAgICAgTGlnaHRTa2luOiB7XHJcbiAgICAgICAgICAgIENoYW5jZUZvclNwZWNpYWxIYWlyQ29sb3I6IDAuMjUsXHJcbiAgICAgICAgICAgIE5vcm1hbEhhaXJDb2xvclJhbmdlOiB7IG1pbjogMCwgbWF4OiAxMyB9LFxyXG4gICAgICAgICAgICBTcGVjaWFsSGFpckNvbG9yUmFuZ2U6IHsgbWluOiAxMywgbWF4OiAzNiB9LFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgTWVkaXVtU2tpbjoge1xyXG4gICAgICAgICAgICBXZWlnaHRzOiB7IE1hdGNoaW5nOiA3NSwgTGlnaHRlcjogMTIuNSwgRGFya2VyOiAxMi41IH0sXHJcbiAgICAgICAgICAgIFJhbmdlczoge1xyXG4gICAgICAgICAgICAgICAgTWF0Y2hpbmc6IHsgbWluOiAxMywgbWF4OiAyMyB9LFxyXG4gICAgICAgICAgICAgICAgTGlnaHRlcjogeyBtaW46IDAsIG1heDogMTMgfSxcclxuICAgICAgICAgICAgICAgIERhcmtlcjogeyBtaW46IDIzLCBtYXg6IDM2IH0sXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgfSxcclxuICAgICAgICBEYXJrU2tpbjoge1xyXG4gICAgICAgICAgICBDaGFuY2VGb3JTcGVjaWFsSGFpckNvbG9yOiAwLjI1LFxyXG4gICAgICAgICAgICBOb3JtYWxIYWlyQ29sb3JSYW5nZTogeyBtaW46IDAsIG1heDogMjMgfSxcclxuICAgICAgICAgICAgU3BlY2lhbEhhaXJDb2xvclJhbmdlOiB7IG1pbjogMjMsIG1heDogMzYgfSxcclxuICAgICAgICB9LFxyXG4gICAgfTtcclxufVxyXG4iXSwibmFtZXMiOlsiU2tpblJhbmRvbWl6ZXJEYXRhIiwiT3B0aW9uQ291bnRzIiwiQm9keVR5cGUiLCJQYW50cyIsIlNoaXJ0IiwiSGFpciIsIkV5ZUNvbG9yIiwiUHJlc2V0T3V0Zml0Q2hhbmNlIiwiQmFzZVNraW4iLCJDaGFuY2VGb3JTcGVjaWFsQmFzZVNraW4iLCJOb3JtYWxCYXNlU2tpblJhbmdlIiwibWluIiwibWF4IiwiU3BlY2lhbEJhc2VTa2luUmFuZ2UiLCJQcmVzZXRPdXRmaXRzUmFuZ2UiLCJTa2luVG9uZVRocmVzaG9sZHMiLCJMaWdodE1heCIsIk1lZGl1bU1heCIsIkV5ZXMiLCJDaGFuY2VGb3JTcGVjaWFsRXllcyIsIk5vcm1hbEV5ZXNSYW5nZSIsIlNwZWNpYWxFeWVzUmFuZ2UiLCJNb3V0aCIsIkNoYW5jZUZvclNwZWNpYWxNb3V0aCIsIk5vcm1hbE1vdXRoUmFuZ2UiLCJTcGVjaWFsTW91dGhSYW5nZSIsIk1vdXRoQ29sb3IiLCJMaWdodFNraW4iLCJDaGFuY2VGb3JTcGVjaWFsTW91dGhDb2xvciIsIk5vcm1hbE1vdXRoQ29sb3JSYW5nZSIsIlNwZWNpYWxNb3V0aENvbG9yUmFuZ2UiLCJNZWRpdW1Ta2luIiwiUmFuZ2UiLCJEYXJrU2tpbiIsIkhhaXJDb2xvciIsIkNoYW5jZUZvclNwZWNpYWxIYWlyQ29sb3IiLCJOb3JtYWxIYWlyQ29sb3JSYW5nZSIsIlNwZWNpYWxIYWlyQ29sb3JSYW5nZSIsIldlaWdodHMiLCJNYXRjaGluZyIsIkxpZ2h0ZXIiLCJEYXJrZXIiLCJSYW5nZXMiXSwibWFwcGluZ3MiOiJBQUFlLE1BQU1BO0FBK0VyQjtBQTlFSSx1REFBdUQ7QUFEdENBLG1CQUVNQyxlQUFlO0lBQ2xDQyxVQUFVO0lBQ1ZDLE9BQU87SUFDUEMsT0FBTztJQUNQQyxNQUFNO0lBQ05DLFVBQVU7QUFDZDtBQVJpQk4sbUJBVU1PLHFCQUFxQixJQUFLLGlHQUFpRzs7QUFFbEosK0NBQStDO0FBWjlCUCxtQkFhTVEsV0FBVztJQUM5QixrRUFBa0U7SUFDbEVDLDBCQUEwQjtJQUMxQkMscUJBQXFCO1FBQUVDLEtBQUs7UUFBR0MsS0FBSztJQUFHO0lBQ3ZDQyxzQkFBc0I7UUFBRUYsS0FBSztRQUFJQyxLQUFLO0lBQUc7SUFDekNFLG9CQUFvQjtRQUFFSCxLQUFLO1FBQUlDLEtBQUs7SUFBRztBQUMzQztBQUVBLG9FQUFvRTtBQXJCbkRaLG1CQXNCTWUscUJBQXFCO0lBQ3hDQyxVQUFVO0lBQ1ZDLFdBQVc7QUFDZjtBQUVBLDZEQUE2RDtBQTNCNUNqQixtQkE0Qk1rQixPQUFPO0lBQzFCQyxzQkFBc0I7SUFDdEJDLGlCQUFpQjtRQUFFVCxLQUFLO1FBQUdDLEtBQUs7SUFBRztJQUNuQ1Msa0JBQWtCO1FBQUVWLEtBQUs7UUFBSUMsS0FBSztJQUFHO0FBQ3pDO0FBRUEsOERBQThEO0FBbEM3Q1osbUJBbUNNc0IsUUFBUTtJQUMzQkMsdUJBQXVCO0lBQ3ZCQyxrQkFBa0I7UUFBRWIsS0FBSztRQUFHQyxLQUFLO0lBQUc7SUFDcENhLG1CQUFtQjtRQUFFZCxLQUFLO1FBQUlDLEtBQUs7SUFBRztBQUMxQztBQUVBLDZFQUE2RTtBQXpDNURaLG1CQTBDTTBCLGFBQWE7SUFDaENDLFdBQVc7UUFDUEMsNEJBQTRCO1FBQzVCQyx1QkFBdUI7WUFBRWxCLEtBQUs7WUFBR0MsS0FBSztRQUFFO1FBQ3hDa0Isd0JBQXdCO1lBQUVuQixLQUFLO1lBQUdDLEtBQUs7UUFBRztJQUM5QztJQUNBbUIsWUFBWTtRQUNSQyxPQUFPO1lBQUVyQixLQUFLO1lBQUlDLEtBQUs7UUFBRztJQUM5QjtJQUNBcUIsVUFBVTtRQUNOTCw0QkFBNEI7UUFDNUJDLHVCQUF1QjtZQUFFbEIsS0FBSztZQUFHQyxLQUFLO1FBQUc7UUFDekNrQix3QkFBd0I7WUFBRW5CLEtBQUs7WUFBSUMsS0FBSztRQUFHO0lBQy9DO0FBQ0o7QUFFQSw0RUFBNEU7QUExRDNEWixtQkEyRE1rQyxZQUFZO0lBQy9CUCxXQUFXO1FBQ1BRLDJCQUEyQjtRQUMzQkMsc0JBQXNCO1lBQUV6QixLQUFLO1lBQUdDLEtBQUs7UUFBRztRQUN4Q3lCLHVCQUF1QjtZQUFFMUIsS0FBSztZQUFJQyxLQUFLO1FBQUc7SUFDOUM7SUFDQW1CLFlBQVk7UUFDUk8sU0FBUztZQUFFQyxVQUFVO1lBQUlDLFNBQVM7WUFBTUMsUUFBUTtRQUFLO1FBQ3JEQyxRQUFRO1lBQ0pILFVBQVU7Z0JBQUU1QixLQUFLO2dCQUFJQyxLQUFLO1lBQUc7WUFDN0I0QixTQUFTO2dCQUFFN0IsS0FBSztnQkFBR0MsS0FBSztZQUFHO1lBQzNCNkIsUUFBUTtnQkFBRTlCLEtBQUs7Z0JBQUlDLEtBQUs7WUFBRztRQUMvQjtJQUNKO0lBQ0FxQixVQUFVO1FBQ05FLDJCQUEyQjtRQUMzQkMsc0JBQXNCO1lBQUV6QixLQUFLO1lBQUdDLEtBQUs7UUFBRztRQUN4Q3lCLHVCQUF1QjtZQUFFMUIsS0FBSztZQUFJQyxLQUFLO1FBQUc7SUFDOUM7QUFDSjtBQTlFSixTQUFxQlosZ0NBK0VwQiJ9