const authorizeRoles =(...allowedRoles)=>{
    return (req, res,next)=>{
        if(!req.user){
            return res.status(401).json({
                message:"Authentication required"
            });
        }

        const userRole = String(req.user.role || "")
            .trim()
            .toUpperCase();

        const canonicalUserRole = [
            "MANAGER",
            "GENERAL MANAGER",
            "ASSISTANT MANAGER"
        ].includes(userRole)
            ? "MANAGER"
            : userRole;

        const normalizedAllowedRoles = allowedRoles.map((role) =>
            String(role).trim().toUpperCase()
        );

        if(!normalizedAllowedRoles.includes(canonicalUserRole)){
            return res.status(403).json({
                message:"Your account does not have permission to perform this action"
            });
        }

        next();
    };
};

module.exports=authorizeRoles;