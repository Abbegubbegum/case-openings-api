import dotenv from "dotenv";
import express from "express";
import cookieParser from "cookie-parser";
import { QueryTypes, Sequelize } from "sequelize";
import cors from "cors";
import * as tedious from "tedious";
import crypt from "bcrypt";
dotenv.config();
const app = express();
const port = process.env.PORT || 8080;
app.use(express.json());
app.use(cookieParser());
app.use(cors());
const sequelize = new Sequelize(process.env.DB_NAME || "", process.env.DB_USER || "", process.env.DB_PASSWORD || "", {
    host: process.env.DB_HOST || "localhost",
    dialect: "mssql",
    dialectModule: tedious,
});
try {
    await sequelize.authenticate();
    console.log("Success");
}
catch (err) {
    console.log(err);
}
const saltRounds = process.env.SALT_ROUNDS || 10;
app.post("/register", async (req, res) => {
    const email = req.body.email;
    const password = req.body.password;
    const users = await sequelize.query(`SELECT ID, PasswordHash, AdministratorAccess FROM Users WHERE Email = '${email}'`, { type: QueryTypes.SELECT });
    let adminAccess = false;
    if (users.length === 0) {
        let hash = await crypt.hash(password, saltRounds);
        let res = await sequelize.query(`INSERT INTO Users (Email, PasswordHash) OUTPUT inserted.ID VALUES ('${email}', '${hash}')`);
        await addCasesToUser(res[0][0].ID, "Weapon Case", 1);
        await addCasesToUser(res[0][0].ID, "Bravo Case", 1);
        await addCasesToUser(res[0][0].ID, "Hydra Case", 2);
    }
    else {
        let result = await crypt.compare(password, users[0].PasswordHash);
        if (!result) {
            return res.status(400).send("User with Email already exists");
        }
        else {
            await addCasesToUser(users[0].ID, "Weapon Case", 1);
            await addCasesToUser(users[0].ID, "Bravo Case", 1);
            await addCasesToUser(users[0].ID, "Hydra Case", 2);
            adminAccess = users[0].AdministratorAccess;
        }
    }
    res.status(200).json(adminAccess);
});
app.post("/login", async (req, res) => {
    const email = req.body.email || "";
    const password = req.body.password || "";
    const users = await sequelize.query(`SELECT AdministratorAccess, ID, PasswordHash FROM Users WHERE Email = '${email}'`, { type: QueryTypes.SELECT });
    let adminAccess = false;
    if (users.length === 0) {
        return res.status(400).send("Email not found");
    }
    else {
        let result = await crypt.compare(password, users[0].PasswordHash);
        if (!result) {
            return res.status(400).send("Incorrect password");
        }
        else {
            adminAccess = users[0].AdministratorAccess;
            await addCasesToUser(users[0].ID, "Weapon Case", 1);
            await addCasesToUser(users[0].ID, "Bravo Case", 1);
            await addCasesToUser(users[0].ID, "Hydra Case", 2);
        }
    }
    res.status(200).json(adminAccess);
    return;
});
/*
        
app.get("/inventory", (req, res) => {
    const idToken = req.query.idToken;

    if (typeof idToken !== "string") {
        res.status(400).send("Bad Request, No ID Token");
        return;
    }

    console.time("Verify ID");

    admin
        .auth()
        .verifyIdToken(idToken)
        .then(async (decodedToken) => {
            console.timeEnd("Verify ID");
            console.time("Get Inventory");
            let inventory = await sequelize.query(
                `SELECT Cases.CaseName, Cases.ImagePath, SUM(InventoryDetails.Quantity) AS Quantity
                FROM Users
                INNER JOIN InventoryDetails
                ON Users.ID = InventoryDetails.UserID
                INNER JOIN Cases
                ON InventoryDetails.CaseID = Cases.ID
                WHERE Users.FirebaseUID = '${decodedToken.uid}' AND Quantity > 0
                GROUP BY Cases.CaseName, Cases.ImagePath`,
                { type: QueryTypes.SELECT }
            );

            console.timeEnd("Get Inventory");

            res.status(200).json(inventory);
        })
        .catch((err) => {
            console.log(err);
            res.status(401).send("Unauthorized Request");
        });
});

app.delete("/case", (req, res) => {
    const idToken = req.body.idToken || "";
    const caseName = req.body.caseName;

    if (typeof idToken !== "string" || typeof caseName !== "string") {
        console.log("Bad Request, No ID Token or Case Name");
        res.status(400).json(false);
        return;
    }

    admin
        .auth()
        .verifyIdToken(idToken)
        .then(async (decodedToken) => {
            let intventoryDetails: any[] = await sequelize.query(
                `SELECT InventoryDetails.ID, InventoryDetails.Quantity FROM Users
                INNER JOIN InventoryDetails
                ON Users.ID = InventoryDetails.UserID
                INNER JOIN Cases
                ON InventoryDetails.CaseID = Cases.ID
                WHERE Cases.CaseName = '${caseName}' AND Users.FirebaseUID = '${decodedToken.uid}'`,
                { type: QueryTypes.SELECT }
            );

            if (intventoryDetails.length === 0) {
                console.log("No Records Found");
                res.status(200).json(false);
                return;
            }

            let removed = false;

            for (let i = 0; i < intventoryDetails.length; i++) {
                if (intventoryDetails[i].Quantity === 1 && !removed) {
                    await sequelize.query(
                        `DELETE FROM InventoryDetails WHERE InventoryDetails.ID = ${intventoryDetails[i].ID}`
                    );
                    removed = true;
                } else if (intventoryDetails[i].Quantity > 1 && !removed) {
                    await sequelize.query(
                        `UPDATE InventoryDetails SET InventoryDetails.Quantity = ${
                            intventoryDetails[i].Quantity - 1
                        } WHERE InventoryDetails.ID = ${
                            intventoryDetails[i].ID
                        }`
                    );
                    removed = true;
                } else if (intventoryDetails[i].Quantity === 0) {
                    await sequelize.query(
                        `DELETE FROM InventoryDetails WHERE InventoryDetails.ID = ${intventoryDetails[i].ID}`
                    );
                }
            }

            console.log(removed);

            res.status(200).json(removed);
            return;
        })
        .catch((err) => {
            console.log(err);
            res.status(401).json(false);
            return;
        });
});

app.get("/items", (req, res) => {
    const idToken = req.query.idToken || "";
    const caseName = req.query.caseName;

    if (typeof idToken !== "string" || typeof caseName !== "string") {
        res.status(400).send("Bad Request, No ID Token or Case Name");
        return;
    }

    admin
        .auth()
        .verifyIdToken(idToken)
        .then(async (decodedToken) => {
            let items = await sequelize.query(
                `SELECT Items.ItemName, Items.ImagePath, Items.Rarity FROM Items
                INNER JOIN Cases
                ON Items.CaseID = Cases.ID
                WHERE Cases.CaseName = '${caseName}'`,
                { type: QueryTypes.SELECT }
            );

            res.status(200).json(items);
        })
        .catch((err) => {
            console.log(err);
            res.status(401).send("Unauthorized");
        });
});
*/
app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
});
async function addCasesToUser(userID, caseName, quantity) {
    console.log("User ID: " + userID);
    let weaponCase = await sequelize.query(`SELECT ID FROM Cases WHERE CaseName = '${caseName}'`, { type: QueryTypes.SELECT });
    if (weaponCase.length === 0) {
        console.log("Case not found with name: " + caseName);
        return;
    }
    const caseID = weaponCase[0].ID;
    console.log("Case ID: " + caseID);
    let [result, metadata] = await sequelize.query(`INSERT INTO InventoryDetails VALUES (${userID}, ${caseID}, ${quantity})`, { type: QueryTypes.INSERT });
    console.log(result, metadata);
}
