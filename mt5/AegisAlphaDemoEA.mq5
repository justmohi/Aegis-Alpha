#property strict
#property version   "1.0"
#property description "Aegis Alpha Exness MT5 Demo-only bridge. Never use on a real account."

input string InpBackendUrl = "https://aegis-alpha-4ttu.onrender.com";
input string InpEaToken = ""; // Set to BROKER_EA_TOKEN on Render; do not publish the real token.
input string InpTradeSymbol = "XAUUSD"; // Must match the broker's Market Watch symbol.
input double InpMaxVolume = 0.03;
input int InpPollSeconds = 5;
input int InpMaxDeviationPoints = 30;

string TrimSlash(string s) { while(StringLen(s)>0 && StringSubstr(s,StringLen(s)-1,1)=="/") s=StringSubstr(s,0,StringLen(s)-1); return s; }

bool DemoGuard() {
   if((ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO) {
      Print("AEGIS BLOCKED: account is not Demo. No trading requests will be sent.");
      return false;
   }
   if(StringFind(AccountInfoString(ACCOUNT_SERVER),"demo") < 0 && StringFind(AccountInfoString(ACCOUNT_SERVER),"Demo") < 0 && StringFind(AccountInfoString(ACCOUNT_SERVER),"Trial") < 0 && StringFind(AccountInfoString(ACCOUNT_SERVER),"trial") < 0) {
      Print("AEGIS BLOCKED: server name does not identify a demo server.");
      return false;
   }
   return true;
}

string JsonValue(string json, string key) {
   string needle="\"" + key + "\":";
   int p=StringFind(json,needle); if(p<0) return "";
   p+=StringLen(needle);
   while(p<StringLen(json) && (StringGetCharacter(json,p)==' ' || StringGetCharacter(json,p)=='\"')) p++;
   int end=p;
   while(end<StringLen(json) && StringGetCharacter(json,end)!='\"' && StringGetCharacter(json,end)!=',' && StringGetCharacter(json,end)!='}') end++;
   return StringSubstr(json,p,end-p);
}

bool Request(string method,string route,string body,string &response,int &status) {
   if(InpEaToken=="") { Print("AEGIS: Configure InpEaToken before connecting."); return false; }
   string url=TrimSlash(InpBackendUrl)+route;
   char data[], result[]; string headers="Content-Type: application/json\r\nAuthorization: Bearer "+InpEaToken+"\r\n";
   if(body!="") { int copied=StringToCharArray(body,data,0,WHOLE_ARRAY,CP_UTF8); if(copied>0) ArrayResize(data,copied-1); }
   else ArrayResize(data,0);
   string responseHeaders;
   ResetLastError();
   status=WebRequest(method,url,headers,8000,data,result,responseHeaders);
   if(status==-1) { Print("AEGIS WebRequest error ",GetLastError(),". Add backend origin to MT5 Tools > Options > Expert Advisors > Allow WebRequest."); return false; }
   response=CharArrayToString(result,0,WHOLE_ARRAY,CP_UTF8);
   return status>=200 && status<300;
}

void SendHeartbeat() {
   if(!DemoGuard()) return;
   string body=StringFormat("{\"demo\":true,\"server\":\"%s\",\"login\":\"%I64d\",\"company\":\"%s\",\"symbol\":\"%s\",\"connected\":%s,\"terminalBuild\":\"%d\"}",
      AccountInfoString(ACCOUNT_SERVER),(long)AccountInfoInteger(ACCOUNT_LOGIN),AccountInfoString(ACCOUNT_COMPANY),_Symbol,
      (TerminalInfoInteger(TERMINAL_CONNECTED)?"true":"false"),(int)TerminalInfoInteger(TERMINAL_BUILD));
   string response; int code; Request("POST","/api/broker/mt5/heartbeat",body,response,code);
}

void ProcessNextOrder() {
   if(!DemoGuard() || !TerminalInfoInteger(TERMINAL_CONNECTED)) return;
   string response; int code;
   if(!Request("POST","/api/broker/mt5/claim","{}",response,code)) return;
   string id=JsonValue(response,"id"); if(id=="") return;
   string symbol=JsonValue(response,"symbol");
   string side=JsonValue(response,"side");
   double volume=StringToDouble(JsonValue(response,"volume"));
   double sl=StringToDouble(JsonValue(response,"stopLoss"));
   double tp=StringToDouble(JsonValue(response,"takeProfit"));
   if((symbol!="XAUUSD" && symbol!=InpTradeSymbol) || volume<=0 || volume>InpMaxVolume || sl<=0 || tp<=0 || (side!="BUY" && side!="SELL")) {
      string msg=StringFormat("{\"status\":\"REJECTED\",\"message\":\"EA validation failed: symbol/volume/SL/TP/side\",\"ticket\":null,\"executionPrice\":null}");
      Request("POST","/api/broker/mt5/orders/"+id+"/result",msg,response,code); return;
   }
   string tradeSymbol=InpTradeSymbol;\n   if(!SymbolSelect(tradeSymbol,true)) {\n      string msg="{\\"status\\":\\"REJECTED\\",\\"message\\":\\"Configured MT5 symbol is unavailable in Market Watch\\",\\"ticket\\":null,\\"executionPrice\\":null}";\n      Request("POST","/api/broker/mt5/orders/"+id+"/result",msg,response,code); return;\n   }\n   double ask=SymbolInfoDouble(tradeSymbol,SYMBOL_ASK), bid=SymbolInfoDouble(tradeSymbol,SYMBOL_BID);
   if(ask<=0 || bid<=0 || (side=="BUY" && (sl>=ask || tp<=ask)) || (side=="SELL" && (sl<=bid || tp>=bid))) {
      string msg="{\"status\":\"REJECTED\",\"message\":\"Invalid live quote or SL/TP direction\",\"ticket\":null,\"executionPrice\":null}";
      Request("POST","/api/broker/mt5/orders/"+id+"/result",msg,response,code); return;
   }
   MqlTradeRequest req={}; MqlTradeResult res={};
   req.action=TRADE_ACTION_DEAL; req.symbol=tradeSymbol; req.volume=volume;
   req.type=(side=="BUY"?ORDER_TYPE_BUY:ORDER_TYPE_SELL);
   req.price=(side=="BUY"?ask:bid); req.sl=sl; req.tp=tp;
   req.deviation=InpMaxDeviationPoints; req.magic=26102901;
   req.comment="AegisAlpha Demo";
   req.type_time=ORDER_TIME_GTC;
   long filling=SymbolInfoInteger(tradeSymbol,SYMBOL_FILLING_MODE);
   if((filling & SYMBOL_FILLING_FOK)==SYMBOL_FILLING_FOK) req.type_filling=ORDER_FILLING_FOK;
   else if((filling & SYMBOL_FILLING_IOC)==SYMBOL_FILLING_IOC) req.type_filling=ORDER_FILLING_IOC;
   else req.type_filling=ORDER_FILLING_RETURN;
   if(!OrderSend(req,res) || (res.retcode!=TRADE_RETCODE_DONE && res.retcode!=TRADE_RETCODE_DONE_PARTIAL)) {
      string msg=StringFormat("{\"status\":\"FAILED\",\"message\":\"OrderSend retcode %u: %s\",\"ticket\":\"%I64u\",\"executionPrice\":%.8f}",res.retcode,res.comment,res.order,res.price);
      Request("POST","/api/broker/mt5/orders/"+id+"/result",msg,response,code); return;
   }
   string msg=StringFormat("{\"status\":\"EXECUTED\",\"message\":\"%s\",\"ticket\":\"%I64u\",\"executionPrice\":%.8f}",res.comment,res.deal,res.price);
   Request("POST","/api/broker/mt5/orders/"+id+"/result",msg,response,code);
}

int OnInit() {
   if(InpPollSeconds<3) { Print("AEGIS: Poll interval must be at least 3 seconds."); return INIT_PARAMETERS_INCORRECT; }
   if(!DemoGuard()) return INIT_FAILED;
   EventSetTimer(InpPollSeconds);
   SendHeartbeat();
   Print("Aegis Alpha Demo EA initialized. Demo-only guard active.");
   return INIT_SUCCEEDED;
}
void OnDeinit(const int reason) { EventKillTimer(); }
void OnTimer() { if(DemoGuard()) { SendHeartbeat(); ProcessNextOrder(); } }
void OnTick() { /* Timer-based polling keeps bridge behavior deterministic. */ }
