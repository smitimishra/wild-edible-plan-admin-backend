const bcrypt = require("bcryptjs");

async function generatePasswords(){
    
    const employeePassword = await bcrypt.hash(
        "employee123",
        10
    );

    const managerPassword = await bcrypt.hash(
        "manager123",
        10
    );

    const hrPassword = await bcrypt.hash(
        "hr123",
        10
    );

    console.log("EMPLOYEE HASH:");
    console.log(employeePassword);

    console.log("\nMANAGER HASH:");
    console.log(managerPassword);

    console.log("\nHR HASH:");
    console.log(hrPassword);
}

generatePasswords();
    
    
    
    
    
    

