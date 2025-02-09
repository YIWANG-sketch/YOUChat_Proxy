import assert from 'assert';
import YouProvider from '../you_providers/youProvider.mjs';
import * as utils from '../utils.mjs';

describe("YouProvider", function() {
  let provider;
  beforeEach(() => {
    provider = new YouProvider({ sessions: [] });
    provider.sessions = {};
  });

  it("_logSwitchMode should log correct message", function() {
    let loggedMessage = "";
    const originalLog = console.log;
    console.log = (msg) => { loggedMessage += msg; };
    provider._logSwitchMode({ currentMode: "custom", switchThreshold: 5 });
    console.log = originalLog;
    assert(loggedMessage.includes("切换到custom模式"), "The log message should include '切换到custom模式'");
    assert(loggedMessage.includes("5"), "The log message should include the threshold 5");
  });

  it("_processSessionCookie should process old cookie correctly", function() {
    const fakeJwtPayload = { user: { name: "testUser" } };
    const tokenPart = Buffer.from(JSON.stringify(fakeJwtPayload)).toString("base64");
    const fakeJwtToken = `header.${tokenPart}.signature`;
    const fakeCookieString = "oldCookie";
    
    // Override extractCookie for testing
    const originalExtractCookie = provider.extractCookie;
    provider.extractCookie = (cookie) => {
      return { jwtSession: "dummy", jwtToken: fakeJwtToken };
    };
    
    provider._processSessionCookie({ cookie: fakeCookieString }, 0);
    provider.extractCookie = originalExtractCookie;
    
    assert(provider.sessions["testUser"], "Session for testUser should be added from old cookie.");
  });

  it("_processSessionCookie should process new cookie correctly", function() {
    const fakeJwtPayload = { email: "newUser@test.com" };
    const tokenPart = Buffer.from(JSON.stringify(fakeJwtPayload)).toString("base64");
    const fakeDs = `header.${tokenPart}.signature`;
    const fakeCookieString = "newCookie";
    
    const originalExtractCookieNew = provider.extractCookie;
    provider.extractCookie = (cookie) => {
      return { ds: fakeDs, dsr: "dummyDSR" };
    };
    
    provider._processSessionCookie({ cookie: fakeCookieString }, 1);
    provider.extractCookie = originalExtractCookieNew;
    
    assert(provider.sessions["newUser@test.com"], "Session for newUser@test.com should be added from new cookie.");
  });
});
