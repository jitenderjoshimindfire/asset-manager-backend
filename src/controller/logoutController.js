const logoutController = (req, res) => {
    try{
        //clear the JWT refresh token cookie by setting it to empty and expired immediatly
        res.clearCookie('jwt', {
            httpOnly: true,
            secure:true,
            sameSite: 'Strict'
        });

        res.status(200).json({
            status: 'success',
            message: 'Logged out successfully'
        })
    }catch(err){
        res.status(500).json({
            status: 'error', 
            message: 'Logout Failed'
        })
    }
}

module.exports = logoutController;