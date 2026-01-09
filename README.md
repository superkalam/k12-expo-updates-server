# Expo update server for orion

### Initial Setup Instructions - DB
1. Setup infisical secrets and link to fly project.
2. Follow the instructions in dockerfile and enable initial setup command while commenting out the one mentioned below it.
3. Deploy on fly using `fly deploy -c fly.[environment].toml`
4. SSH into the machine using `fly ssh console -c fly.[environment].toml`
5. Run the following commands
    ```
    mongosh

    use admin

    db.createUser({ user: "<username>", pwd: "<password>", roles: [{ role: "userAdminAnyDatabase", db: "admin"}, "readWriteAnyDatabase" ]})

    exit
    exit
    ```
6. Comment out the initial setup instructions from dockerfile and restore the other line.
7. Deploy again on fly using 
    ```
    fly deploy -c=fly.[environment].toml --no-cache
    ```
8. Your connection string to use now is:
    ```
    mongodb://<username>:<password>@<fly-app-name>.internal:27017/?directConnection=true&serverSelectionTimeoutMS=2000&authSource=admin&appName=mongosh+2.3.0
    ```
