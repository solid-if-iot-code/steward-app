import express, { Express, Request, Response } from "express";
import {
    getSessionFromStorage,
    Session
} from '@inrupt/solid-client-authn-node'; 
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
    setStringNoLocale,
    universalAccess,
    addIri
} from '@inrupt/solid-client';
import path from "path";
import * as multer from "multer";
import { randomBytes } from "crypto";
// import { QueryEngine } from "@comunica/query-sparql";
import _ from "lodash";
import { FOAF } from "@inrupt/vocab-common-rdf";
// const myEngine = new QueryEngine();
const upload = multer.default();
const PORT = process.env.PORT || 3001;
const app: Express = express();
//this uses path join with __dirname
//__dirname is the current directory of the executed file, which is necessary for the js file
//after it is compiled into the dist folder from src/app.ts
app.use('/js', express.static(path.join(__dirname, 'public/js')))
app.use(express.json());
app.use(express.urlencoded());
//app.use(bodyParser.urlencoded());
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
  
app.get("/redirect-from-solid-idp", async (req: Request, res: Response) => {
    const session = await getSessionFromStorage((req.session as CookieSessionInterfaces.CookieSessionObject).sessionId);

    await (session as Session).handleIncomingRedirect(`http://localhost:${PORT}${req.url}`);

    if ((session as Session).info.isLoggedIn) {
        res.redirect('/home');
    }
});

app.get('/home', async (req: Request, res: Response) => {
    const session = await getSessionFromStorage((req.session as CookieSessionInterfaces.CookieSessionObject).sessionId);
    if (session) {
        res.render('home.pug')
    } else {
        res.render('error.pug')
    }
})

app.get('/create_sensor', async (req: Request, res: Response) => { 
    const session = await getSessionFromStorage((req.session as CookieSessionInterfaces.CookieSessionObject).sessionId);
    if (session) {
        res.render('inspect.pug')
    } else {
        res.render('error.pug')
    }
})

function genRandomToken() {
    return randomBytes(64).toString('hex');
}

async function getSensorInboxResource(session: Session, webId: string): Promise<string | null> {
    //const webId = session.info.webId!;
    let dataset = await getSolidDataset(webId, { fetch: session.fetch });
    const rdfThing = getThing(dataset, webId);
    const profileUri = getUrl(rdfThing!, FOAF.isPrimaryTopicOf);
    // dereference profile document w/ uri
    let profileDataset = await getSolidDataset(profileUri!, { fetch: session.fetch });
    // https://solid.github.io/data-interoperability-panel/specification/#data-grant
    // query the dataset for the user card 
    const extWebID = getThing(profileDataset, webId);
    const sensorInboxUri = getStringNoLocale(extWebID!, 'http://www.example.org/sensor#sensorInbox');
    return sensorInboxUri;
}

function parseData(body: any) {
    const sensorName = body.sensorName;
    const webIds: Array<string> = body.webIds.split(',');
    const sensorUri = body.sensorUri;
    const brokerUri = body.brokerUri;
    const topics: Array<string> = typeof body.topic === 'string' ? [body.topic] : body.topic;
    const topicTypes: Array<string> = typeof body.topicType === 'string' ? [body.topicType] : body.topicType;
    return { sensorName, webIds, sensorUri, brokerUri, topics, topicTypes}
}

function buildSensorInfoThing(webId: string, sensorName: string, sensorUri: string, brokerUri: string, topicsUri: string) {
    let sensorThing = buildThing(createThing({name: sensorName}))
        .addIri("https://www.example.org/webId", webId)
        .addStringNoLocale('https://www.example.org/sensor#sensorUri', sensorUri)
        .addIri('https://www.example.org/sensor#brokerUri', brokerUri)
        .addStringNoLocale('https://www.example.org/sensor#name', sensorName)
        .addIri('https://www.example.org/sensor#topicsUri', topicsUri)
        .build();
    
    return sensorThing;
}

function buildThingsDictWithSecretKey(sensorThing: any, webIds: Array<string>) {
    let keyThings: any = {}
    for (const webId of webIds) {
        const key = genRandomToken();
        let newThing = setStringNoLocale(sensorThing, 'https://www.example.com/key#secure', key);
        keyThings[webId] = newThing;
    }
    return keyThings;
}

async function getStorageUri(session: Session) {
    const webId = session.info.webId!;
    const webIdData = await getSolidDataset(webId, { fetch: session.fetch })
    const webIdDoc = getThing(webIdData, webId);
    const storageUri = getUrl(webIdDoc!, 'http://www.w3.org/ns/pim/space#storage');
    return storageUri;
}

async function setAccessForWebIdsAtUrl(session: Session, urls: Array<string>, webIds: Array<string>) {
    console.log('setting access')
    try {
        for (const webId of webIds) {
            for (const url of urls) {
                await universalAccess.setAgentAccess(url, webId, { read: true, write: false }, { fetch: session.fetch })
            }
        }
    } catch (err: any) {
        console.log(err);
        throw new Error(err.message)
    }    
}

function buildTopicsThing(topics: Array<string>, topicTypes: Array<string>) {
    let topicsThing = buildThing(createThing()).build();
    for (let i = 0; i < topics.length; i++) {
        if (topicTypes[i] === 'publish') {
            topicsThing = addStringNoLocale(topicsThing, 'https://www.example.org/sensor#publishTopic', topics[i]);
        } else {
            topicsThing = addStringNoLocale(topicsThing, 'https://www.example.org/sensor#subscribeTopic', topics[i]);
        }
    }
    return topicsThing;
}

function saveInWebIds(webIds: Array<string>, session: Session, keyThings: any): Promise<number> {
    return new Promise((res, rej) => {
        for (const webId of webIds) {
            let newData = createSolidDataset();
            newData = setThing(newData, keyThings[webId])
            getSensorInboxResource(session, webId)
              .then((sensorInboxUri) => {
                saveSolidDatasetInContainer(sensorInboxUri as string, newData, { fetch: session.fetch })
              })
              .catch((err) => {
                console.log(err);
                rej(404)
              })
        } 
        res(200)
    })
}

async function saveAndUpdateDatasetWithThing(newUri: string, thing: any, session: Session): Promise<boolean | Error> {
    let dataset = await getSolidDataset(newUri, { fetch: session.fetch });
    dataset = setThing(dataset, thing);
    return new Promise((res, rej) => {
        saveSolidDatasetAt(newUri, dataset, { fetch: session.fetch })
        .then(data => {
            console.log(data);
            res(true)
        })
        .catch(err => {
            console.log(err)
            rej(false)
        })
    })
}

function buildPermittedThing(webIds: Array<string>) {
    let thing = buildThing(createThing()).build();
    for (const webId of webIds) {
        thing = addIri(thing, "https://www.example.org/permitted#webId", webId)
    }
    return thing;
}

app.post('/add_sensor', async (req: Request, res: Response) => { 
    const session = await getSessionFromStorage((req.session as CookieSessionInterfaces.CookieSessionObject).sessionId)
    if (session) {
        //console.log(req.body)
        try {
            const storageUri = await getStorageUri(session)
            //console.log('storage')
            const { sensorName, webIds, sensorUri, brokerUri, topics, topicTypes } = parseData(req.body);
            //console.log('parse')
            const publicContainerUri = `${storageUri}public/`
            const sensorsContainerUri = `${publicContainerUri}sensors/`
            const newSensorContainerUri = `${sensorsContainerUri}${sensorName}/`
            //console.log('container')
            const newSensorInfoUri = `${newSensorContainerUri}info`;
            //console.log(newSensorInfoUri)
            const newSensorTopicsUri = `${newSensorContainerUri}topics`;
            //console.log(newSensorTopicsUri)
            const newSensorPermittedUri = `${newSensorContainerUri}permitted`
            //let data = createSolidDataset();
            try {
                await getSolidDataset(newSensorPermittedUri, { fetch: session.fetch })
                //console.log(`${newSensorInfoUri} exists`)
            } catch (err) {
                console.log(err)
                let newData = createSolidDataset();
                try {
                    await saveSolidDatasetAt(newSensorPermittedUri, newData, { fetch: session.fetch })
                } catch (err) {
                    console.log('fatal error 1')
                    res.redirect('/error')
                }
            }
            try {
                await getSolidDataset(newSensorInfoUri, { fetch: session.fetch })
                //console.log(`${newSensorInfoUri} exists`)
            } catch (err) {
                console.log(err)
                let newData = createSolidDataset();
                try {
                    await saveSolidDatasetAt(newSensorInfoUri, newData, { fetch: session.fetch })
                } catch (err) {
                    console.log('fatal error 1')
                    res.redirect('/error')
                }
            }
            try {
                await getSolidDataset(newSensorTopicsUri, { fetch: session.fetch })
                //console.log(`${newSensorTopicsUri} exists`)
            } catch (err) {
                console.log(err)
                let newData = createSolidDataset();
                try {
                    await saveSolidDatasetAt(newSensorTopicsUri, newData, { fetch: session.fetch })
                } catch (err) {
                    console.log('fatal err')
                    res.redirect('/error')
                }
            }
            await setAccessForWebIdsAtUrl(session, [newSensorInfoUri, newSensorTopicsUri], webIds);
            
            let topicsThing = buildTopicsThing(topics, topicTypes)
            let success = await saveAndUpdateDatasetWithThing(newSensorTopicsUri, topicsThing, session)
            if (!success) throw new Error(`failed to save ${newSensorTopicsUri}`)
            
            let sensorThing = buildSensorInfoThing(session.info.webId!, sensorName, sensorUri, brokerUri, newSensorTopicsUri);
            success = await saveAndUpdateDatasetWithThing(newSensorInfoUri, sensorThing, session)
            if (!success) throw new Error(`failed to save ${newSensorInfoUri}`)
            
            let permittedThing = buildPermittedThing(webIds);
            success = await saveAndUpdateDatasetWithThing(newSensorPermittedUri, permittedThing, session)
            if (!success) throw new Error(`failed to save ${newSensorPermittedUri}`)

            let keyThings = buildThingsDictWithSecretKey(sensorThing, webIds);
            const resCode = await saveInWebIds(webIds, session, keyThings);
            console.log(resCode)
            res.status(resCode).end();
        } catch (err) {
            res.redirect('/error');
        }
        //res.redirect('/home');
    } else {
        res.redirect('/error')
    }
})

app.get('/error', (req: Request, res: Response) => {
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