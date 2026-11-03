#property strict
#property version   "1.0"
#property description "Aegis Alpha Exness MT5 Demo-only bridge. Never use on a real account."

input string InpBackendUrl = "https://aegis-alpha-4ttu.onrender.com";
input string InpEaToken = ""; // Set to BROKER_EA_TOKEN on Render; do not publish the real token.
input string InpTradeSymbol = "XAUUSD"; // Must match the broker's Market Watch symbol.
input double InpMaxVolume = 0.03; // User-configurable ceiling; hard safety cap below cannot be overridden.
const double AEGIS_HARD_MAX_VOLUME = 0.03;
input int InpPollSeconds = 5;
input int InpMaxDeviationPoints = 30;

string TrimSlash(string s) { while(StringLen(s)>0 && StringSubstr(s,StringLen(s)-1,1)=="/") s=StringSubstr(s,0,StringLen(s)-1); return s; }

bool DemoGuard() {
   if((ENUM_ACCOUNT_TRADE_MODE)AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO) {
      Print("AEGIS BLOCKED: account is not Demo. No trading requests will be sent.");
      return false;
   }
   string server=AccountInfoString(ACCOUNT_SERVER);
   StringToLower(server);
   if(StringFind(server,"demo") < 0 && StringFind(server,"trial") < 0) {
      Print("AEGIS BLOCKED: server name does not identify a demo/trial server.");
      return false;
   }
   return true;
}

bool IsGoldSymbol(string symbol) {
   string normalized=symbol;
   StringToUpper(normalized);
   StringReplace(normalized," ","");
   StringReplace(normalized,"/","");
   StringReplace(normalized,"_","");
   StringReplace(normalized,"-","");
   return (normalized=="XAUUSD" || normalized=="XAUUSDM" || normalized=="XAUUSD.");
}

bool ValidBrokerVolume(string symbol,double volume) {
   double minVolume=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MIN);
   double maxVolume=SymbolInfoDouble(symbol,SYMBOL_VOLUME_MAX);
   double step=SymbolInfoDouble(symbol,SYMBOL_VOLUME_STEP);
   if(minVolume<=0 || maxVolume<=0 || step<=0 || volume<minVolume-1e-8 ||
      volume>maxVolume+1e-8 || volume>InpMaxVolume+1e-8 || volume>AEGIS_HARD_MAX_VOLUME+1e-8) return false;
   double steps=(volume-minVolume)/step;
   return MathAbs(steps-MathRound(steps))<1e-6;
}

bool SelectSupportedFilling(string symbol,ENUM_ORDER_TYPE_FILLING &fillingMode) {
   long flags=SymbolInfoInteger(symbol,SYMBOL_FILLING_MODE);
   ENUM_SYMBOL_TRADE_EXECUTION execution=(ENUM_SYMBOL_TRADE_EXECUTION)SymbolInfoInteger(symbol,SYMBOL_TRADE_EXEMODE);
   if((flags & SYMBOL_FILLING_IOC)==SYMBOL_FILLING_IOC) {
      fillingMode=ORDER_FILLING_IOC;
      return true;
   }
   if((flags & SYMBOL_FILLING_FOK)==SYMBOL_FILLING_FOK) {
      fillingMode=ORDER_FILLING_FOK;
      return true;
   }
   if(execution!=SYMBOL_TRADE_EXECUTION_MARKET) {
      fillingMode=ORDER_FILLING_RETURN;
      return true;
   }
   Print("AEGIS BLOCKED: broker exposes no supported filling mode for Market Execution.");
   return false;
}


string JsonEscape(string value) {
   string escaped="";
   for(int i=0;i<StringLen(value);i++) {
      ushort ch=StringGetCharacter(value,i);
      if(ch=='"') escaped+="\\\"";
      else if(ch=='\\') escaped+="\\\\";
      else if(ch=='\n') escaped+="\\n";
      else if(ch=='\r') escaped+="\\r";
      else if(ch=='\t') escaped+="\\t";
      else if(ch<32) escaped+=" ";
      else escaped+=ShortToString(ch);
   }
   return escaped;
}

string JsonValue(string json, string key) {
   string needle="\"" + key + "\"";
   int p=StringFind(json,needle);
   if(p<0) return "";
   p+=StringLen(needle);
   while(p<StringLen(json) && (StringGetCharacter(json,p)==' ' || StringGetCharacter(json,p)=='\t' || StringGetCharacter(json,p)=='\r' || StringGetCharacter(json,p)=='\n')) p++;
   if(p>=StringLen(json) || StringGetCharacter(json,p)!=':') return "";
   p++;
   while(p<StringLen(json) && (StringGetCharacter(json,p)==' ' || StringGetCharacter(json,p)=='\t' || StringGetCharacter(json,p)=='\r' || StringGetCharacter(json,p)=='\n')) p++;
   if(p>=StringLen(json)) return "";
   if(StringGetCharacter(json,p)=='"') {
      p++;
      string value="";
      while(p<StringLen(json)) {
         ushort ch=StringGetCharacter(json,p);
         if(ch=='"') return value;
         if(ch=='\\' && p+1<StringLen(json)) {
            p++;
            ushort escaped=StringGetCharacter(json,p);
            if(escaped=='"' || escaped=='\\' || escaped=='/') value+=ShortToString(escaped);
            else if(escaped=='n') value+=" ";
            else if(escaped=='r' || escaped=='t') value+=" ";
            else return "";
         } else {
            value+=StringSubstr(json,p,1);
         }
         p++;
      }
      return "";
   }
   int valueStart=p;
   while(p<StringLen(json) && StringGetCharacter(json,p)!=',' && StringGetCharacter(json,p)!='}' &&
         StringGetCharacter(json,p)!=' ' && StringGetCharacter(json,p)!='\t' &&
         StringGetCharacter(json,p)!='\r' && StringGetCharacter(json,p)!='\n') p++;
   string value=StringSubstr(json,valueStart,p-valueStart);
   if(value=="null" || value=="true" || value=="false") return "";
   return value;
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
      JsonEscape(AccountInfoString(ACCOUNT_SERVER)),(long)AccountInfoInteger(ACCOUNT_LOGIN),
      JsonEscape(AccountInfoString(ACCOUNT_COMPANY)),JsonEscape(_Symbol),
      (TerminalInfoInteger(TERMINAL_CONNECTED)?"true":"false"),(int)TerminalInfoInteger(TERMINAL_BUILD));
   string response; int code; Request("POST","/api/broker/mt5/heartbeat",body,response,code);
}

bool ReportOrderResult(string orderId,string body) {
   string response;
   int status=0;
   bool ok=Request("POST","/api/broker/mt5/orders/"+orderId+"/result",body,response,status);
   if(!ok) {
      // Never auto-resend an execution result: a timeout may mean the server
      // accepted it but the acknowledgement was lost. Keep the order for manual reconciliation.
      Print("AEGIS RESULT ACK UNKNOWN for order ",orderId,
            ". HTTP/status=",status,
            ", terminalError=",GetLastError(),
            ". Do not re-submit or re-queue automatically; reconcile with MT5 history and backend.");
      return false;
   }
   Print("AEGIS result acknowledged for order ",orderId,". HTTP ",status,": ",response);
   return true;
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
   if(!IsGoldSymbol(symbol) || !IsGoldSymbol(InpTradeSymbol) || volume<=0 || volume>InpMaxVolume || volume>AEGIS_HARD_MAX_VOLUME || sl<=0 || tp<=0 || (side!="BUY" && side!="SELL")) {
      string msg="{\"status\":\"REJECTED\",\"message\":\"EA validation failed: symbol/volume/SL/TP/side\",\"ticket\":null,\"executionPrice\":null}";
      ReportOrderResult(id,msg); return;
   }
   string tradeSymbol=InpTradeSymbol;
   if(!SymbolSelect(tradeSymbol,true)) {
      string msg="{\"status\":\"REJECTED\",\"message\":\"Configured MT5 symbol is unavailable in Market Watch\",\"ticket\":null,\"executionPrice\":null}";
      ReportOrderResult(id,msg);
      return;
   }
   if(SymbolInfoInteger(tradeSymbol,SYMBOL_TRADE_MODE)==SYMBOL_TRADE_MODE_DISABLED ||
      !ValidBrokerVolume(tradeSymbol,volume)) {
      string msg="{\"status\":\"REJECTED\",\"message\":\"Broker symbol is disabled or volume violates broker min/max/step\",\"ticket\":null,\"executionPrice\":null}";
      ReportOrderResult(id,msg); return;
   }
   long tradeMode=SymbolInfoInteger(tradeSymbol,SYMBOL_TRADE_MODE);
   bool directionAllowed=(tradeMode==SYMBOL_TRADE_MODE_FULL) ||
                         (side=="BUY" && tradeMode==SYMBOL_TRADE_MODE_LONGONLY) ||
                         (side=="SELL" && tradeMode==SYMBOL_TRADE_MODE_SHORTONLY);
   if(!directionAllowed) {
      string msg="{\"status\":\"REJECTED\",\"message\":\"Broker symbol trade mode does not allow this order direction\",\"ticket\":null,\"executionPrice\":null}";
      ReportOrderResult(id,msg);
      Print("AEGIS blocked ",side," because broker symbol trade mode is ",tradeMode);
      return;
   }

   double ask=SymbolInfoDouble(tradeSymbol,SYMBOL_ASK), bid=SymbolInfoDouble(tradeSymbol,SYMBOL_BID);
   double point=SymbolInfoDouble(tradeSymbol,SYMBOL_POINT);
   int digits=(int)SymbolInfoInteger(tradeSymbol,SYMBOL_DIGITS);
   int stopsLevel=(int)SymbolInfoInteger(tradeSymbol,SYMBOL_TRADE_STOPS_LEVEL);
   double minDistance=stopsLevel*point;
   sl=NormalizeDouble(sl,digits);
   tp=NormalizeDouble(tp,digits);
   bool invalidStops=(side=="BUY" && (sl>=ask || tp<=ask || ask-sl<minDistance || tp-ask<minDistance)) ||
                     (side=="SELL" && (sl<=bid || tp>=bid || sl-bid<minDistance || bid-tp<minDistance));
   if(ask<=0 || bid<=0 || point<=0 || invalidStops) {
      string msg="{\"status\":\"REJECTED\",\"message\":\"Invalid quote or SL/TP direction/minimum stop distance\",\"ticket\":null,\"executionPrice\":null}";
      ReportOrderResult(id,msg); return;
   }
   ENUM_ORDER_TYPE_FILLING fillingMode;
   if(!SelectSupportedFilling(tradeSymbol,fillingMode)) {
      string msg="{\"status\":\"REJECTED\",\"message\":\"Broker execution filling mode is unsupported\",\"ticket\":null,\"executionPrice\":null}";
      ReportOrderResult(id,msg); return;
   }
   MqlTradeRequest req={}; MqlTradeResult res={};
   req.action=TRADE_ACTION_DEAL; req.symbol=tradeSymbol; req.volume=volume;
   req.type=(side=="BUY"?ORDER_TYPE_BUY:ORDER_TYPE_SELL);
   req.price=NormalizeDouble(side=="BUY"?ask:bid,digits); req.sl=sl; req.tp=tp;
   req.deviation=InpMaxDeviationPoints; req.magic=26102901;
   req.comment="AegisAlpha Demo";
   req.type_time=ORDER_TIME_GTC;
   req.type_filling=fillingMode;

   // Preflight the exact request with the terminal/broker before sending it.
   // A successful check is not an execution; OrderSend remains a separate step.
   MqlTradeCheckResult check={};
   ResetLastError();
   if(!OrderCheck(req,check)) {
      int checkError=GetLastError();
      string checkMessage=StringFormat("OrderCheck rejected request (error %d, retcode %u): %s",
                                       checkError,check.retcode,check.comment);
      string msg=StringFormat("{\"status\":\"FAILED\",\"message\":\"%s\",\"ticket\":null,\"executionPrice\":null}",
                              JsonEscape(checkMessage));
      Print("AEGIS preflight blocked order ",id,": ",checkMessage);
      ReportOrderResult(id,msg);
      return;
   }

   if(!OrderSend(req,res) || (res.retcode!=TRADE_RETCODE_DONE && res.retcode!=TRADE_RETCODE_DONE_PARTIAL)) {
      string msg=StringFormat("{\"status\":\"FAILED\",\"message\":\"OrderSend retcode %u: %s\",\"ticket\":\"%I64u\",\"executionPrice\":%.8f,\\\"executionVolume\\\":%.3f}",res.retcode,JsonEscape(res.comment),res.order,res.price);
      ReportOrderResult(id,msg); return;
   }
   if(res.retcode==TRADE_RETCODE_DONE_PARTIAL) {
      string partialMessage=StringFormat("PARTIAL_FILL: filled %.3f of requested %.3f lots. Broker: %s",
                                         res.volume,req.volume,res.comment);
      string msg=StringFormat("{\"status\":\"EXECUTED\",\"message\":\"%s\",\"ticket\":\"%I64u\",\"executionPrice\":%.8f}",
                              JsonEscape(partialMessage),res.deal,res.price,res.volume);
      Print("AEGIS partial fill for order ",id,": ",partialMessage);
      ReportOrderResult(id,msg);
      return;
   }
   string msg=StringFormat("{\"status\":\"EXECUTED\",\"message\":\"%s\",\"ticket\":\"%I64u\",\"executionPrice\":%.8f}",JsonEscape(res.comment),res.deal,res.price,res.volume);
   ReportOrderResult(id,msg);
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
