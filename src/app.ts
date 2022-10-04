import express, { Express, Request, Response } from "express";
import {
    clearSessionFromStorageAll,
    getSessionFromStorage,
    getSessionIdFromStorageAll,
    Session
}  from '@inrupt/solid-client-authn-node'; 
import cookieSession from "cookie-session";
import { getSolidDataset,
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

async function getSensorInboxResource(session: Session): Promise<string | null> {
    const webId = session.info.webId!;
    let dataset = await getSolidDataset(webId, { fetch: session.fetch });
    const rdfThing = getThing(dataset, webId);
    const extendedProfileUri = getUrl(rdfThing!, 'http://www.w3.org/2000/01/rdf-schema#seeAlso');
    // dereference extended profile document w/ uri
    let extendedProfileDataset = await getSolidDataset(extendedProfileUri!, { fetch: session.fetch });
    // https://solid.github.io/webid-profile/#reading-extended-profile-documents
    // https://solid.github.io/data-interoperability-panel/specification/#data-grant
    // query the dataset for the user card 
    const extWebID = getThing(extendedProfileDataset, webId);
    const sensorInboxUri = getStringNoLocale(extWebID!, 'http://www.example.org/sensor#sensorInbox');
    return sensorInboxUri;
}

async function createSensorInboxUri(session: Session, sensorInboxUri: string): Promise<string> {
    const webId = session.info.webId!;
    let dataset = await getSolidDataset(webId, { fetch: session.fetch });
    const rdfThing = getThing(dataset, webId);
    const extendedProfileUri = getUrl(rdfThing!, 'http://www.w3.org/2000/01/rdf-schema#seeAlso');
    // dereference extended profile document w/ uri
    let extendedProfileDataset = await getSolidDataset(extendedProfileUri!, { fetch: session.fetch });
    // https://solid.github.io/webid-profile/#reading-extended-profile-documents
    // https://solid.github.io/data-interoperability-panel/specification/#data-grant
    // space prefix then creating storage, retrieve the extended profile storage uri then build the profile uri
    const SPACE_PREFIX = "http://www.w3.org/ns/pim/space#";
    const STORAGE_SUBJ = `${SPACE_PREFIX}storage`;
    const storageUri = getUrl(rdfThing!, STORAGE_SUBJ);
    // query the dataset for the user card 
    const extWebID = getThing(extendedProfileDataset, webId);
    //update the card with the public type index type (predicate) and location (object)
    const newExtWID = setStringNoLocale(extWebID!, "http://www.example.org/sensor#sensorInbox", sensorInboxUri);
    extendedProfileDataset = setThing(extendedProfileDataset, newExtWID)
    // save the extended profile with the new public type index in the card
    let newDataset = createSolidDataset();
    try {
        await saveSolidDatasetAt(extendedProfileUri!, extendedProfileDataset, { fetch: session.fetch });
        await saveSolidDatasetAt(`${storageUri}/${sensorInboxUri}`, newDataset, { fetch: session.fetch })
        return '/home'
    } catch (err) {
        console.error(err);
        return '/error'
    }
}

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
        const sensorInboxResource = await getSensorInboxResource(session);
        if (sensorInboxResource) {
            try {
                console.log(sensorInboxResource)
                const webId = session.info.webId!;
                let dataset = await getSolidDataset(webId, { fetch: session.fetch });
                const rdfThing = getThing(dataset, webId);
                // dereference extended profile document w/ uri
                // https://solid.github.io/webid-profile/#reading-extended-profile-documents
                // https://solid.github.io/data-interoperability-panel/specification/#data-grant
                // space prefix then creating storage, retrieve the extended profile storage uri then build the profile uri
                const SPACE_PREFIX = "http://www.w3.org/ns/pim/space#";
                const STORAGE_SUBJ = `${SPACE_PREFIX}storage`;
                const storageUri = getUrl(rdfThing!, STORAGE_SUBJ);
                const data = await getSolidDataset(`${storageUri}${sensorInboxResource}`, {fetch: session.fetch});
                console.log(data)
                res.render('home.pug')
            } catch (err) {
                console.log(err);
            }
            
        } else {
            res.redirect('/error')
        }
    } else {
        res.render('error.pug')
    }
})

app.post('/create_config', upload.none(), async (req: Request, res: Response) => {
    console.log(req.body);
    const session = await getSessionFromStorage((req.session as CookieSessionInterfaces.CookieSessionObject).sessionId)
    if (session?.info.isLoggedIn) {
        const uri = await createSensorInboxUri(session, req.body.sessionInboxUri)
        res.redirect(uri);
    }
})

app.get('/error', (req, res) => {
    res.render('error.pug');
});

app.get('/config', async (req: Request, res: Response) => {
    const session = await getSessionFromStorage((req.session as CookieSessionInterfaces.CookieSessionObject).sessionId)
    if (session?.info.isLoggedIn) {
        try {
            const sensorInboxUri = await getSensorInboxResource(session);
            if (!sensorInboxUri) {
                res.render('config.pug')
            } else {
                res.render('update_cfg.pug')
            }
        } catch (error) {
            console.log(error);
            res.redirect('/error')
        }
    }
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