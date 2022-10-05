import express, { Express, Request, Response } from "express";
import {
    getSessionFromStorage,
    Session
}  from '@inrupt/solid-client-authn-node'; 
import cookieSession from "cookie-session";
import { 
    getSolidDataset,
    getPodUrlAll,
    createSolidDataset, 
    buildThing, 
    createThing, 
    saveFileInContainer, 
    getSourceUrl, 
    overwriteFile,
    saveSolidDatasetAt,
    addUrl,
    addStringNoLocale,
    addDate,
    setThing,
    saveSolidDatasetInContainer,
    createContainerAt,
    createContainerInContainer,
    getContainedResourceUrlAll,
    getThingAll,
    getStringNoLocale,
    toRdfJsDataset,
    getThing,
    getUrl,
    setUrl,
    setStringNoLocale
} from '@inrupt/solid-client';
import path from "path";
import * as multer from "multer";
import { QueryEngine } from "@comunica/query-sparql";
import _ from "lodash";
const myEngine = new QueryEngine();
const upload = multer.default();
const PORT = process.env.PORT || 3000;
const app: Express = express();
//this uses path join with __dirname
//__dirname is the current directory of the executed file, which is necessary for the js file
//after it is compiled into the dist folder from src/app.ts
app.use('/js', express.static(path.join(__dirname, 'public/js')))
app.use(express.json());
app.use(express.urlencoded());
//this sets the views directory for the compiled app.js file in the dist folder after tpyescript has compiled
app.set('views', path.join(__dirname, '/views'))
app.set('view engine', 'pug');
//app.use(cors());
app.use(
    cookieSession({
      name: "session",
      // These keys are required by cookie-session to sign the cookies.
      keys: [
        "Required, but value not relevant for this demo - key1",
        "Required, but value not relevant for this demo - key2",
      ],
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    })
);

app.get('/', (req: Request, res: Response) => {
    res.render('index.pug')
})

app.post("/login", upload.none(), (req: Request, res: Response) => {
    (req.session as CookieSessionInterfaces.CookieSessionObject).oidcIssuer = req.body.oidcIssuer;
    res.redirect('/login');
})

app.get("/login", async (req: Request, res: Response) => {
    const session = new Session();
    const oidcIssuer = (req.session as CookieSessionInterfaces.CookieSessionObject).oidcIssuer;
    (req.session as CookieSessionInterfaces.CookieSessionObject).sessionId = session.info.sessionId;
    const redirectToSolidIdentityProvider = (url: string) => {
        res.redirect(url);
    };
    try {
        await session.login({
            redirectUrl: `http://localhost:${PORT}/redirect-from-solid-idp`,
            oidcIssuer: oidcIssuer,
            clientName: "SOLID-if-IoT Steward App",
            handleRedirect: redirectToSolidIdentityProvider,
        });
    } catch (err) {
        res.redirect('/');
    }
});
  
app.get("/redirect-from-solid-idp", async (req, res) => {
    const session = await getSessionFromStorage((req.session as CookieSessionInterfaces.CookieSessionObject).sessionId);

    await (session as Session).handleIncomingRedirect(`http://localhost:${PORT}${req.url}`);

    if ((session as Session).info.isLoggedIn) {
        res.redirect('/home');
    }
});

app.get('/home', async (req: Request, res: Response) => {
    const session = await getSessionFromStorage((req.session as CookieSessionInterfaces.CookieSessionObject).sessionId);
    if (session) {

    } else {
        res.render('error.pug')
    }
})


app.get('/error', (req, res) => {
    res.render('error.pug');
});


app.get('/logout', async (req: Request, res: Response) => {
    if (typeof req.session === undefined || typeof req.session === null) {
        res.render('error.pug')
    } else {
        const session = await getSessionFromStorage((req.session as CookieSessionInterfaces.CookieSessionObject).sessionId)
        if (session?.info.isLoggedIn) {
            await session.logout();
        }
        res.render('logged_out.pug')
    }
})

app.listen(PORT, () => {
    console.log(`Server started on port: ${PORT}`)
})